using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SivayaanCrm.Api.Data;
using SivayaanCrm.Api.Models;

namespace SivayaanCrm.Api.Controllers;

[ApiController, Route("api/orders")]
public class OrdersController(CrmDb db) : ControllerBase
{
    [HttpGet]
    public async Task<object> List(string? accountId, int? productId, int page = 1, int pageSize = 25)
    {
        var q = db.Orders.AsNoTracking().Where(o => (accountId == null || o.AccountId == accountId) && (productId == null || o.ProductId == productId));
        pageSize = Math.Clamp(pageSize, 1, 100);
        var total = await q.CountAsync();
        var items = await q.OrderByDescending(o => o.OrderDate).ThenByDescending(o => o.Id).Skip((Math.Max(page, 1) - 1) * pageSize).Take(pageSize)
            .Select(o => new { o.Id, o.AccountId, account = o.Account!.Name, o.ProductId, product = o.Product!.Name, o.Item, o.Quantity, o.Amount, o.OrderDate, o.Notes }).ToListAsync();
        return new { total, page, pageSize, items };
    }

    [HttpPost]
    public async Task<IActionResult> Create(Order o)
    {
        if (!await db.Accounts.AnyAsync(a => a.Id == o.AccountId)) return BadRequest("Choose a valid customer.");
        if (!await db.Products.AnyAsync(p => p.Id == o.ProductId)) return BadRequest("Choose a product.");
        if (o.Amount < 0) return BadRequest("Amount cannot be negative.");
        o.Id = 0; o.Account = null; o.Product = null;
        o.Quantity = Math.Max(1, o.Quantity);
        o.Item = string.IsNullOrWhiteSpace(o.Item) ? null : o.Item.Trim();
        o.OrderDate = o.OrderDate == default ? Rules.Today() : o.OrderDate.Date;
        db.Orders.Add(o);
        await db.SaveChangesAsync();
        return Ok(new { o.Id });
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var o = await db.Orders.FindAsync(id);
        if (o is null) return NotFound();
        db.Orders.Remove(o);
        await db.SaveChangesAsync();
        return NoContent();
    }
}

/// <summary>Customers = accounts with at least one order. Status comes from days since the last order:
/// Active (0-30), At Risk (31-75), Lost (76+).</summary>
[ApiController, Route("api/customers")]
public class CustomersController(CrmDb db) : ControllerBase
{
    [HttpGet]
    public async Task<object> List(string? search, string? status, int? productId, int page = 1, int pageSize = 25)
    {
        var today = Rules.Today();
        var rows = await db.Orders.AsNoTracking().Where(o => productId == null || o.ProductId == productId)
            .Select(o => new { o.AccountId, o.OrderDate, o.Amount }).ToListAsync();
        var stats = rows.GroupBy(r => r.AccountId).Select(g =>
        {
            var last = g.Max(x => x.OrderDate);
            var days = Math.Max(0, (int)(today - last.Date).TotalDays);
            return new { AccountId = g.Key, LastOrder = last, Orders = g.Count(), Total = g.Sum(x => x.Amount), Days = days, Status = Rules.CustomerStatus(days) };
        }).ToList();

        var accounts = (await db.Accounts.AsNoTracking().Where(a => stats.Select(s => s.AccountId).Contains(a.Id))
            .Select(a => new { a.Id, a.Name, a.Phone, a.Industry, a.City }).ToListAsync()).ToDictionary(a => a.Id);

        var named = stats.Where(s => accounts.ContainsKey(s.AccountId)).Select(s => new { s, a = accounts[s.AccountId] })
            .Where(x => string.IsNullOrWhiteSpace(search) || x.a.Name.Contains(search, StringComparison.OrdinalIgnoreCase)).ToList();
        var counts = new
        {
            all = named.Count,
            active = named.Count(x => x.s.Status == "Active"),
            atRisk = named.Count(x => x.s.Status == "At Risk"),
            lost = named.Count(x => x.s.Status == "Lost")
        };
        var filtered = string.IsNullOrEmpty(status) ? named : named.Where(x => x.s.Status == status).ToList();
        // At Risk / Lost: longest silent first (most urgent); otherwise most recent buyers first.
        var ordered = status is "At Risk" or "Lost" ? filtered.OrderByDescending(x => x.s.Days) : filtered.OrderBy(x => x.s.Days);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var items = ordered.Skip((Math.Max(page, 1) - 1) * pageSize).Take(pageSize).Select(x => new
        {
            accountId = x.a.Id, name = x.a.Name, x.a.Phone, x.a.Industry, x.a.City,
            lastOrder = x.s.LastOrder, daysSince = x.s.Days, orders = x.s.Orders, total = x.s.Total, status = x.s.Status
        }).ToList();
        return new { total = filtered.Count, page, pageSize, counts, items };
    }
}

[ApiController, Route("api")]
public class FollowUpsController(CrmDb db) : ControllerBase
{
    /// <summary>Open leads whose follow-up is due today or overdue, oldest first.</summary>
    [HttpGet("followups")]
    public async Task<object> List(int? productId, int limit = 100)
    {
        var today = Rules.Today();
        var tomorrow = today.AddDays(1);
        var q = db.Leads.AsNoTracking().Where(l => !l.Converted && l.Status != "Unqualified" && l.FollowUpDate != null && l.FollowUpDate < tomorrow
            && (productId == null || l.ProductId == productId));
        var total = await q.CountAsync();
        var items = await q.OrderBy(l => l.FollowUpDate)
            .ThenBy(l => l.Priority == "Critical" ? 0 : l.Priority == "High" ? 1 : l.Priority == "Medium" ? 2 : 3)
            .Take(Math.Clamp(limit, 1, 500))
            .Select(l => new
            {
                l.Id, l.AccountId, account = l.Account!.Name, product = l.Product!.Name, productColor = l.Product.Color, l.Priority, l.Status, l.NextAction, l.FollowUpDate,
                landmark = l.Account.Landmark ?? l.Account.City, latitude = l.Account.Latitude, longitude = l.Account.Longitude,
                contactName = l.Account.Contacts.OrderByDescending(c => c.IsDecisionMaker).Select(c => c.Name).FirstOrDefault(),
                phone = l.Account.Phone ?? l.Account.Contacts.Where(c => c.Phone != null).Select(c => c.Phone).FirstOrDefault()
            }).ToListAsync();
        return new
        {
            total, today,
            items = items.Select(i => new { i.Id, i.AccountId, i.account, i.product, i.productColor, i.Priority, i.Status, i.NextAction, i.FollowUpDate, i.landmark, i.latitude, i.longitude, i.contactName, i.phone, overdue = i.FollowUpDate < today })
        };
    }

    public record FollowedUp(int? Days, string? Note, string? Channel = null);

    /// <summary>Record that a follow-up was done: logs a WhatsApp activity and moves the next follow-up out.</summary>
    [HttpPost("leads/{id:int}/followed-up")]
    public async Task<IActionResult> Done(int id, FollowedUp req)
    {
        var l = await db.Leads.Include(x => x.Account).Include(x => x.Product).FirstOrDefaultAsync(x => x.Id == id);
        if (l is null) return NotFound();
        var days = Math.Clamp(req.Days ?? 3, 1, 365);
        l.LastContactDate = DateTime.UtcNow;
        l.FollowUpDate = Rules.Today().AddDays(days);
        if (l.Status == "New") l.Status = "Contacted";
        db.Activities.Add(new Activity
        {
            AccountId = l.AccountId, Type = req.Channel == "Email" ? "Email" : "WhatsApp", Subject = $"Follow-up done ({l.Product!.Name})",
            Notes = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim()
        });
        await db.SaveChangesAsync();
        return NoContent();
    }
}
