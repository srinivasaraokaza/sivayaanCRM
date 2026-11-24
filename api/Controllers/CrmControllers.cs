using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SivayaanCrm.Api.Data;
using SivayaanCrm.Api.Models;

namespace SivayaanCrm.Api.Controllers;

public static class Rules
{
    public static int StageProbability(string stage) => stage switch
    {
        "Prospecting" => 10, "Qualified" => 25, "Demo" => 40, "Proposal" => 60, "Negotiation" => 80, "Won" => 100, _ => 0
    };
    public static string NewAccountId() => "CRM-" + Guid.NewGuid().ToString("N")[..6].ToUpper();

    // "Today" for follow-ups, months and customer status follows the business's clock (IST by default), not UTC.
    public static int UtcOffsetMinutes { get; set; } = 330;
    public static DateTime Today() => DateTime.UtcNow.AddMinutes(UtcOffsetMinutes).Date;

    // Customer status from days since the last order.
    public const int AtRiskAfterDays = 31, LostAfterDays = 76;
    public static string CustomerStatus(int daysSinceLastOrder) =>
        daysSinceLastOrder >= LostAfterDays ? "Lost" : daysSinceLastOrder >= AtRiskAfterDays ? "At Risk" : "Active";
}

[ApiController, Route("api")]
public class MetaController(CrmDb db, IConfiguration config) : ControllerBase
{
    public record Office(string Name, string? Address, string? PlusCode, double Latitude, double Longitude);

    [HttpGet("meta")]
    public async Task<object> Meta() => new
    {
        // "Location 0": the base every field route starts from. Edit the Office section of appsettings.json to move it.
        office = config.GetSection("Office").Get<Office>() is { } o && (o.Latitude != 0 || o.Longitude != 0) ? o : null,
        stages = Stages.All,
        leadStatuses = Stages.LeadStatuses,
        leadSources = Stages.LeadSources,
        visitOutcomes = Stages.VisitOutcomes.Select(o => new { code = o.Code, label = o.Label, status = o.Status, days = o.FollowUpDays, nextAction = o.NextAction, tone = o.Tone }),
        products = await db.Products.AsNoTracking().Where(p => p.IsActive).OrderBy(p => p.Id)
            .Select(p => new { p.Id, p.Code, p.Name, p.Industry, p.Color, p.DefaultDealValue, p.Segments }).ToListAsync(),
        industries = await db.Accounts.Where(a => a.Industry != null).Select(a => a.Industry).Distinct().OrderBy(c => c).ToListAsync(),
        categories = await db.Accounts.Where(a => a.Category != null).Select(a => a.Category).Distinct().OrderBy(c => c).ToListAsync()
    };

    [HttpGet("dashboard")]
    public async Task<object> Dashboard(int? productId)
    {
        var today = Rules.Today();
        var tomorrow = today.AddDays(1);
        var monthStart = new DateTime(today.Year, today.Month, 1);
        var yearStart = monthStart.AddMonths(-11);
        var orderQ = db.Orders.AsNoTracking().Where(o => productId == null || o.ProductId == productId);
        var dealQ =db.Deals.AsNoTracking().Where(d => productId == null || d.ProductId == productId);
        var leadQ = db.Leads.AsNoTracking().Where(l => productId == null || l.ProductId == productId);
        var accQ = db.Accounts.AsNoTracking().Where(a => productId == null || a.Leads.Any(l => l.ProductId == productId) || a.Deals.Any(d => d.ProductId == productId));
        var deals = await dealQ.ToListAsync();
        var open = deals.Where(d => d.Stage != "Won" && d.Stage != "Lost").ToList();
        var won = deals.Where(d => d.Stage == "Won").ToList();
        var lost = deals.Count(d => d.Stage == "Lost");
        var intelQ = accQ.Where(a => a.Tier != null);
        var openLeads = leadQ.Where(l => !l.Converted && l.Status != "Unqualified");

        var products = await db.Products.AsNoTracking().Where(p => p.IsActive).OrderBy(p => p.Id).ToListAsync();
        var leadCounts = await openLeads.GroupBy(l => l.ProductId).Select(g => new { id = g.Key, n = g.Count() }).ToListAsync();
        var byProduct = products.Select(p =>
        {
            var pd = db.Deals.AsNoTracking().Where(d => d.ProductId == p.Id).ToList();
            var po = pd.Where(d => d.Stage != "Won" && d.Stage != "Lost").ToList();
            return new
            {
                p.Id, p.Name, p.Color, p.Industry,
                openLeads = leadCounts.FirstOrDefault(c => c.id == p.Id)?.n ?? 0,
                openDeals = po.Count, pipeline = po.Sum(d => d.Value),
                wonCount = pd.Count(d => d.Stage == "Won"), wonValue = pd.Where(d => d.Stage == "Won").Sum(d => d.Value)
            };
        }).ToList();

        // Orders: month-to-date figures, 12-month revenue trend, and top sellers (by item name, else product).
        var monthAmounts = await orderQ.Where(o => o.OrderDate >= monthStart).Select(o => o.Amount).ToListAsync();
        var yearOrders = await orderQ.Where(o => o.OrderDate >= yearStart).Select(o => new { o.OrderDate, o.Amount }).ToListAsync();
        var sold = await orderQ.Select(o => new { Name = o.Item ?? o.Product!.Name, o.Quantity, o.Amount }).ToListAsync();
        var totalLeads = await leadQ.CountAsync();
        var convertedLeads = await leadQ.CountAsync(l => l.Converted);
        var sources = await leadQ.GroupBy(l => l.Source ?? "Unknown")
            .Select(g => new { key = g.Key, leads = g.Count(), converted = g.Sum(l => l.Converted ? 1 : 0) }).ToListAsync();

        return new
        {
            revenueThisMonth = monthAmounts.Sum(),
            ordersThisMonth = monthAmounts.Count,
            totalRevenue = sold.Sum(s => s.Amount),
            customers = await orderQ.Select(o => o.AccountId).Distinct().CountAsync(),
            newLeads30d = await leadQ.CountAsync(l => l.CreatedAt >= DateTime.UtcNow.AddDays(-30)),
            conversionRate = totalLeads == 0 ? 0 : Math.Round(100.0 * convertedLeads / totalLeads, 1),
            followUpsToday = await openLeads.CountAsync(l => l.FollowUpDate != null && l.FollowUpDate >= today && l.FollowUpDate < tomorrow),
            followUpsOverdue = await openLeads.CountAsync(l => l.FollowUpDate != null && l.FollowUpDate < today),
            bySource = sources.OrderByDescending(s => s.leads).Select(s => new { s.key, s.leads, s.converted, rate = s.leads == 0 ? 0 : Math.Round(100.0 * s.converted / s.leads, 1) }),
            monthlyRevenue = Enumerable.Range(0, 12).Select(i =>
            {
                var m = yearStart.AddMonths(i);
                var inMonth = yearOrders.Where(o => o.OrderDate.Year == m.Year && o.OrderDate.Month == m.Month).ToList();
                return new { month = m.ToString("MMM yy", System.Globalization.CultureInfo.InvariantCulture), revenue = inMonth.Sum(o => o.Amount), orders = inMonth.Count };
            }),
            topSelling = sold.GroupBy(s => s.Name).Select(g => new { name = g.Key, revenue = g.Sum(s => s.Amount), quantity = g.Sum(s => s.Quantity) })
                .OrderByDescending(s => s.revenue).Take(8),
            accounts = await accQ.CountAsync(),
            openLeads = await openLeads.CountAsync(),
            hasIntelligence = await intelQ.AnyAsync(),
            highOpportunity = await intelQ.CountAsync(a => a.OpportunityBand == "High" || a.OpportunityBand == "Priority"),
            noWebsite = await intelQ.CountAsync(a => a.Website == null),
            leadsByStatus = await leadQ.GroupBy(l => l.Status).Select(g => new { key = g.Key, count = g.Count() }).ToListAsync(),
            leadsByPriority = await openLeads.GroupBy(l => l.Priority).Select(g => new { key = g.Key, count = g.Count() }).ToListAsync(),
            leadsBySource = await leadQ.GroupBy(l => l.Source ?? "Unknown").Select(g => new { key = g.Key, count = g.Count() }).ToListAsync(),
            maturity = await intelQ.GroupBy(a => a.MaturityBand).Select(g => new { key = g.Key, count = g.Count() }).ToListAsync(),
            overdueFollowUps = await openLeads.CountAsync(l => l.FollowUpDate != null && l.FollowUpDate < today),
            openDeals = open.Count,
            pipelineValue = open.Sum(d => d.Value),
            weightedValue = open.Sum(d => d.Value * d.CloseProbability / 100m),
            wonCount = won.Count,
            wonValue = won.Sum(d => d.Value),
            winRate = won.Count + lost == 0 ? 0 : Math.Round(100.0 * won.Count / (won.Count + lost), 1),
            stages = Stages.All.Select(s => new { stage = s, count = deals.Count(d => d.Stage == s), value = deals.Where(d => d.Stage == s).Sum(d => d.Value) }),
            byProduct,
            recentActivities = await db.Activities.AsNoTracking()
                .Where(a => productId == null || (a.DealId != null && db.Deals.Any(d => d.Id == a.DealId && d.ProductId == productId)) || a.Account!.Leads.Any(l => l.ProductId == productId))
                .OrderByDescending(a => a.Date).Take(8)
                .Select(a => new { a.Id, a.Type, a.Subject, a.Date, a.AccountId, account = a.Account!.Name }).ToListAsync()
        };
    }
}

[ApiController, Route("api/products")]
public class ProductsController(CrmDb db) : ControllerBase
{
    [HttpGet]
    public async Task<object> List() => await db.Products.AsNoTracking().OrderBy(p => p.Id).Select(p => new
    {
        p.Id, p.Code, p.Name, p.Industry, p.Description, p.Website, p.DefaultDealValue, p.Segments, p.Color, p.IsActive,
        leads = db.Leads.Count(l => l.ProductId == p.Id), deals = db.Deals.Count(d => d.ProductId == p.Id)
    }).ToListAsync();

    [HttpPost]
    public async Task<IActionResult> Create(Product p)
    {
        p.Code = (p.Code ?? "").Trim().ToUpperInvariant();
        if (p.Code == "" || string.IsNullOrWhiteSpace(p.Name)) return BadRequest("Code and name are required.");
        if (await db.Products.AnyAsync(x => x.Code == p.Code)) return Conflict("A product with this code already exists.");
        p.Id = 0;
        db.Products.Add(p);
        await db.SaveChangesAsync();
        return Ok(new { p.Id });
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, Product input)
    {
        var p = await db.Products.FindAsync(id);
        if (p is null) return NotFound();
        if (string.IsNullOrWhiteSpace(input.Name)) return BadRequest("Name is required.");
        p.Name = input.Name; p.Industry = input.Industry; p.Description = input.Description; p.Website = input.Website;
        p.DefaultDealValue = input.DefaultDealValue; p.Segments = input.Segments; p.Color = input.Color; p.IsActive = input.IsActive;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var p = await db.Products.FindAsync(id);
        if (p is null) return NotFound();
        if (await db.Leads.AnyAsync(l => l.ProductId == id) || await db.Deals.AnyAsync(d => d.ProductId == id))
            return Conflict("This product has leads or deals. Deactivate it instead of deleting.");
        db.Products.Remove(p);
        await db.SaveChangesAsync();
        return NoContent();
    }
}

[ApiController, Route("api/accounts")]
public class AccountsController(CrmDb db) : ControllerBase
{
    [HttpGet]
    public async Task<object> List(string? search, string? industry, string? category, string? band, string? website, string? sort, int? productId, int page = 1, int pageSize = 25)
    {
        var q = db.Accounts.AsNoTracking().AsQueryable();
        if (productId != null) q = q.Where(a => a.Leads.Any(l => l.ProductId == productId) || a.Deals.Any(d => d.ProductId == productId));
        if (!string.IsNullOrWhiteSpace(search)) q = q.Where(a => EF.Functions.Like(a.Name, $"%{search}%") || (a.Landmark != null && EF.Functions.Like(a.Landmark, $"%{search}%")) || (a.City != null && EF.Functions.Like(a.City, $"%{search}%")));
        if (!string.IsNullOrEmpty(industry)) q = q.Where(a => a.Industry == industry);
        if (!string.IsNullOrEmpty(category)) q = q.Where(a => a.Category == category);
        if (!string.IsNullOrEmpty(band)) q = q.Where(a => a.OpportunityBand == band);
        if (website == "none") q = q.Where(a => a.Website == null);
        if (website == "has") q = q.Where(a => a.Website != null);
        q = sort switch
        {
            "name" => q.OrderBy(a => a.Name),
            "maturity" => q.OrderBy(a => a.DigitalMaturity),
            "distance" => q.OrderBy(a => a.DistanceKm),
            _ => q.OrderByDescending(a => a.Opportunity).ThenBy(a => a.Name)
        };
        pageSize = Math.Clamp(pageSize, 1, 100);
        var total = await q.CountAsync();
        var items = await q.Skip((Math.Max(page, 1) - 1) * pageSize).Take(pageSize).Select(a => new
        {
            a.Id, a.Name, a.Industry, a.Category, a.City, a.Landmark, a.Phone, a.Email, a.Website, a.Latitude, a.Longitude, a.Tier, a.Opportunity, a.OpportunityBand, a.DigitalMaturity, a.MaturityBand,
            a.CompetitivePosition, a.TopRecommendation, deals = a.Deals.Count, contacts = a.Contacts.Count,
            leadProducts = a.Leads.Select(l => l.ProductId).ToList(), dealProducts = a.Deals.Select(d => d.ProductId).ToList()
        }).ToListAsync();
        // SQLite cannot translate Union over correlated subqueries, so merge here.
        return new
        {
            total, page, pageSize,
            items = items.Select(a => new
            {
                a.Id, a.Name, a.Industry, a.Category, a.City, a.Landmark, a.Phone, a.Email, a.Website, a.Latitude, a.Longitude, a.Tier, a.Opportunity, a.OpportunityBand, a.DigitalMaturity,
                a.MaturityBand, a.CompetitivePosition, a.TopRecommendation, a.deals, a.contacts, productIds = a.leadProducts.Union(a.dealProducts).ToList()
            })
        };
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(string id)
    {
        var a = await db.Accounts.AsNoTracking().AsSplitQuery()
            .Include(x => x.Leads).ThenInclude(l => l.Product)
            .Include(x => x.Contacts).Include(x => x.Deals).ThenInclude(d => d.Product).Include(x => x.Recommendations)
            .Include(x => x.Orders.OrderByDescending(o => o.OrderDate)).ThenInclude(o => o.Product)
            .Include(x => x.Activities.OrderByDescending(ac => ac.Date))
            .FirstOrDefaultAsync(x => x.Id == id);
        return a is null ? NotFound() : Ok(a);
    }

    [HttpPost]
    public async Task<IActionResult> Create(Account a)
    {
        if (string.IsNullOrWhiteSpace(a.Name)) return BadRequest("Name is required.");
        a.Id = Rules.NewAccountId();
        a.Recommendations = []; a.Contacts = []; a.Deals = []; a.Activities = []; a.Leads = [];
        db.Accounts.Add(a);
        await db.SaveChangesAsync();
        return Ok(new { a.Id });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, Account input)
    {
        var a = await db.Accounts.FindAsync(id);
        if (a is null) return NotFound();
        if (string.IsNullOrWhiteSpace(input.Name)) return BadRequest("Name is required.");
        a.Name = input.Name; a.Industry = input.Industry; a.Category = input.Category; a.City = input.City; a.Landmark = input.Landmark;
        a.Phone = input.Phone; a.Email = input.Email; a.Website = input.Website;
        if (input.Latitude is < -90 or > 90 || input.Longitude is < -180 or > 180) return BadRequest("Latitude must be -90 to 90 and longitude -180 to 180.");
        if ((input.Latitude == null) != (input.Longitude == null)) return BadRequest("Enter both latitude and longitude, or neither.");
        a.Latitude = input.Latitude; a.Longitude = input.Longitude;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var a = await db.Accounts.FindAsync(id);
        if (a is null) return NotFound();
        db.Accounts.Remove(a);
        await db.SaveChangesAsync();
        return NoContent();
    }
}

[ApiController, Route("api/leads")]
public class LeadsController(CrmDb db) : ControllerBase
{
    [HttpGet]
    public async Task<object> List(string? search, string? status, string? priority, bool? overdue, int? productId, bool includeConverted = false, int page = 1, int pageSize = 25)
    {
        var q = db.Leads.AsNoTracking().AsQueryable();
        if (productId != null) q = q.Where(l => l.ProductId == productId);
        if (!includeConverted) q = q.Where(l => !l.Converted);
        if (!string.IsNullOrWhiteSpace(search)) q = q.Where(l => EF.Functions.Like(l.Account!.Name, $"%{search}%"));
        if (!string.IsNullOrEmpty(status)) q = q.Where(l => l.Status == status);
        if (!string.IsNullOrEmpty(priority)) q = q.Where(l => l.Priority == priority);
        if (overdue == true) q = q.Where(l => l.FollowUpDate != null && l.FollowUpDate < Rules.Today() && l.Status != "Unqualified");
        pageSize = Math.Clamp(pageSize, 1, 100);
        var total = await q.CountAsync();
        var items = await q.OrderBy(l => l.Priority == "Critical" ? 0 : l.Priority == "High" ? 1 : l.Priority == "Medium" ? 2 : 3)
            .ThenByDescending(l => l.Account!.Opportunity).ThenByDescending(l => l.Id)
            .Skip((Math.Max(page, 1) - 1) * pageSize).Take(pageSize)
            .Select(l => new
            {
                l.Id, l.AccountId, account = l.Account!.Name, category = l.Account.Category ?? l.Account.Industry, landmark = l.Account.Landmark ?? l.Account.City, phone = l.Account.Phone,
                latitude = l.Account.Latitude, longitude = l.Account.Longitude,
                opportunity = l.Account.Tier != null ? (int?)l.Account.Opportunity : null,
                l.ProductId, product = l.Product!.Name, productColor = l.Product.Color,
                l.Status, l.Priority, l.Source, l.CreatedAt, l.NextAction, l.FollowUpDate, l.LastContactDate, l.Visits, l.Notes, l.Converted
            }).ToListAsync();
        return new { total, page, pageSize, items };
    }

    public record NewLead(string? AccountId, string? Name, string? Phone, string? Email, string? City, string? Industry, int ProductId,
        string? Source, string? Priority, string? NextAction, DateTime? FollowUpDate, string? Notes, string? ContactName);

    /// <summary>Create a lead for an existing account, or create the account (and optional contact) in one step.</summary>
    [HttpPost]
    public async Task<IActionResult> Create(NewLead r)
    {
        var product = await db.Products.FindAsync(r.ProductId);
        if (product is null) return BadRequest("Choose a product.");
        Account? acc;
        if (!string.IsNullOrEmpty(r.AccountId))
        {
            acc = await db.Accounts.FindAsync(r.AccountId);
            if (acc is null) return BadRequest("Account not found.");
        }
        else
        {
            if (string.IsNullOrWhiteSpace(r.Name)) return BadRequest("Business / customer name is required.");
            // Reuse an existing customer with the same name and phone rather than creating a duplicate.
            acc = string.IsNullOrWhiteSpace(r.Phone) ? null
                : await db.Accounts.FirstOrDefaultAsync(a => a.Phone == r.Phone && a.Name.ToLower() == r.Name.Trim().ToLower());
        }
        if (acc is null)
        {
            acc = new Account { Id = Rules.NewAccountId(), Name = r.Name.Trim(), Phone = r.Phone, Email = r.Email, City = r.City, Industry = r.Industry ?? product.Industry };
            db.Accounts.Add(acc);
            if (!string.IsNullOrWhiteSpace(r.ContactName))
                db.Contacts.Add(new Contact { AccountId = acc.Id, Name = r.ContactName.Trim(), Phone = r.Phone, Email = r.Email, IsDecisionMaker = true });
        }
        if (await db.Leads.AnyAsync(l => l.AccountId == acc.Id && l.ProductId == product.Id && !l.Converted))
            return Conflict($"{acc.Name} already has an open {product.Name} lead.");
        var lead = new Lead
        {
            AccountId = acc.Id, ProductId = product.Id, Source = r.Source, Priority = r.Priority ?? "Medium", NextAction = r.NextAction,
            FollowUpDate = r.FollowUpDate?.Date ?? Rules.Today().AddDays(1), Notes = r.Notes
        };
        db.Leads.Add(lead);
        await db.SaveChangesAsync();
        return Ok(new { lead.Id, accountId = acc.Id });
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, Lead input)
    {
        var l = await db.Leads.FindAsync(id);
        if (l is null) return NotFound();
        if (!Stages.LeadStatuses.Contains(input.Status)) return BadRequest("Invalid status.");
        l.Status = input.Status; l.Priority = input.Priority; l.Source = input.Source; l.NextAction = input.NextAction; l.FollowUpDate = input.FollowUpDate;
        l.Notes = input.Notes; l.CurrentSoftware = input.CurrentSoftware; l.Competitor = input.Competitor;
        await db.SaveChangesAsync();
        return NoContent();
    }

    public record ConvertRequest(decimal Value, string? Module, string? Title, string? Segment, int? Units);

    [HttpPost("{id:int}/convert")]
    public async Task<IActionResult> Convert(int id, ConvertRequest req)
    {
        var l = await db.Leads.Include(x => x.Account).Include(x => x.Product).FirstOrDefaultAsync(x => x.Id == id);
        if (l is null) return NotFound();
        if (l.Converted) return Conflict("Lead is already converted.");
        var deal = new Deal
        {
            AccountId = l.AccountId, ProductId = l.ProductId, Module = req.Module, Value = req.Value,
            Segment = string.IsNullOrWhiteSpace(req.Segment) ? null : req.Segment.Trim(), Units = Math.Max(1, req.Units ?? 1),
            Title = string.IsNullOrWhiteSpace(req.Title) ? $"{l.Product!.Name} - {l.Account!.Name}" : req.Title,
            Stage = "Qualified", CloseProbability = Rules.StageProbability("Qualified")
        };
        l.Converted = true; l.Status = "Qualified";
        db.Deals.Add(deal);
        db.Activities.Add(new Activity { AccountId = l.AccountId, Type = "Note", Subject = $"Lead converted to deal: {deal.Title}" });
        await db.SaveChangesAsync();
        return Ok(new { deal.Id });
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var l = await db.Leads.FindAsync(id);
        if (l is null) return NotFound();
        db.Leads.Remove(l);
        await db.SaveChangesAsync();
        return NoContent();
    }
}

[ApiController, Route("api/contacts")]
public class ContactsController(CrmDb db) : ControllerBase
{
    [HttpGet]
    public async Task<object> List(string? search, string? accountId, int? productId, int page = 1, int pageSize = 25)
    {
        var q = db.Contacts.AsNoTracking().AsQueryable();
        if (!string.IsNullOrEmpty(accountId)) q = q.Where(c => c.AccountId == accountId);
        if (productId != null) q = q.Where(c => c.Account!.Leads.Any(l => l.ProductId == productId) || c.Account.Deals.Any(d => d.ProductId == productId));
        if (!string.IsNullOrWhiteSpace(search)) q = q.Where(c => EF.Functions.Like(c.Name, $"%{search}%") || EF.Functions.Like(c.Account!.Name, $"%{search}%"));
        pageSize = Math.Clamp(pageSize, 1, 100);
        var total = await q.CountAsync();
        var items = await q.OrderBy(c => c.Name).Skip((Math.Max(page, 1) - 1) * pageSize).Take(pageSize)
            .Select(c => new { c.Id, c.AccountId, account = c.Account!.Name, c.Name, c.Title, c.Phone, c.Email, c.IsDecisionMaker }).ToListAsync();
        return new { total, page, pageSize, items };
    }

    [HttpPost]
    public async Task<IActionResult> Create(Contact c)
    {
        if (string.IsNullOrWhiteSpace(c.Name) || !await db.Accounts.AnyAsync(a => a.Id == c.AccountId)) return BadRequest("Name and a valid account are required.");
        c.Id = 0; c.Account = null; c.CreatedAt = DateTime.UtcNow;
        db.Contacts.Add(c);
        await db.SaveChangesAsync();
        return Ok(new { c.Id });
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, Contact input)
    {
        var c = await db.Contacts.FindAsync(id);
        if (c is null) return NotFound();
        c.Name = input.Name; c.Title = input.Title; c.Phone = input.Phone; c.Email = input.Email; c.IsDecisionMaker = input.IsDecisionMaker;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var c = await db.Contacts.FindAsync(id);
        if (c is null) return NotFound();
        db.Contacts.Remove(c);
        await db.SaveChangesAsync();
        return NoContent();
    }
}

[ApiController, Route("api/deals")]
public class DealsController(CrmDb db) : ControllerBase
{
    [HttpGet]
    public async Task<object> List(string? accountId, int? productId) =>
        await db.Deals.AsNoTracking().Where(d => (accountId == null || d.AccountId == accountId) && (productId == null || d.ProductId == productId))
            .OrderByDescending(d => d.UpdatedAt)
            .Select(d => new
            {
                d.Id, d.AccountId, account = d.Account!.Name, d.Title, d.ProductId, product = d.Product!.Name, productColor = d.Product.Color, d.Module, d.Segment, d.Units,
                d.Value, d.Stage, d.CloseProbability, d.ExpectedCloseDate, d.Notes, d.UpdatedAt
            }).ToListAsync();

    [HttpPost]
    public async Task<IActionResult> Create(Deal d)
    {
        if (string.IsNullOrWhiteSpace(d.Title) || !await db.Accounts.AnyAsync(a => a.Id == d.AccountId)) return BadRequest("Title and a valid account are required.");
        if (!await db.Products.AnyAsync(p => p.Id == d.ProductId)) return BadRequest("Choose a product.");
        if (!Stages.All.Contains(d.Stage)) d.Stage = "Prospecting";
        d.Id = 0; d.Account = null; d.Product = null; d.Units = Math.Max(1, d.Units); d.CreatedAt = d.UpdatedAt = DateTime.UtcNow;
        if (d.CloseProbability == 0 && d.Stage != "Lost") d.CloseProbability = Rules.StageProbability(d.Stage);
        db.Deals.Add(d);
        await db.SaveChangesAsync();
        return Ok(new { d.Id });
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, Deal input)
    {
        var d = await db.Deals.FindAsync(id);
        if (d is null) return NotFound();
        if (!Stages.All.Contains(input.Stage)) return BadRequest("Invalid stage.");
        if (!await db.Products.AnyAsync(p => p.Id == input.ProductId)) return BadRequest("Choose a product.");
        d.Title = input.Title; d.ProductId = input.ProductId; d.Module = input.Module; d.Segment = input.Segment; d.Units = Math.Max(1, input.Units); d.Value = input.Value; d.Stage = input.Stage;
        d.CloseProbability = input.CloseProbability; d.ExpectedCloseDate = input.ExpectedCloseDate; d.Notes = input.Notes; d.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return NoContent();
    }

    public record StageRequest(string Stage);

    [HttpPatch("{id:int}/stage")]
    public async Task<IActionResult> MoveStage(int id, StageRequest req)
    {
        var d = await db.Deals.FindAsync(id);
        if (d is null) return NotFound();
        if (!Stages.All.Contains(req.Stage)) return BadRequest("Invalid stage.");
        if (d.Stage != req.Stage)
        {
            db.Activities.Add(new Activity { AccountId = d.AccountId, DealId = d.Id, Type = "Note", Subject = $"Deal '{d.Title}' moved {d.Stage} -> {req.Stage}" });
            d.Stage = req.Stage; d.CloseProbability = Rules.StageProbability(req.Stage); d.UpdatedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var d = await db.Deals.FindAsync(id);
        if (d is null) return NotFound();
        db.Deals.Remove(d);
        await db.SaveChangesAsync();
        return NoContent();
    }
}

[ApiController, Route("api/activities")]
public class ActivitiesController(CrmDb db) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Create(Activity a)
    {
        if (string.IsNullOrWhiteSpace(a.Subject) || !await db.Accounts.AnyAsync(x => x.Id == a.AccountId)) return BadRequest("Subject and a valid account are required.");
        a.Id = 0; a.Account = null; a.Date = a.Date == default ? DateTime.UtcNow : a.Date.ToUniversalTime();
        db.Activities.Add(a);
        if (a.Type != "Note")
        {
            // Touch the open lead(s) this activity relates to: the deal's product if given, otherwise all open leads on the account.
            var dealProduct = a.DealId == null ? null : await db.Deals.Where(d => d.Id == a.DealId).Select(d => (int?)d.ProductId).FirstOrDefaultAsync();
            var leads = await db.Leads.Where(l => l.AccountId == a.AccountId && !l.Converted && (dealProduct == null || l.ProductId == dealProduct)).ToListAsync();
            foreach (var lead in leads)
            {
                lead.LastContactDate = a.Date;
                if (a.Type == "Visit") lead.Visits++;
                if (lead.Status == "New") lead.Status = "Contacted";
            }
        }
        await db.SaveChangesAsync();
        return Ok(new { a.Id });
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var a = await db.Activities.FindAsync(id);
        if (a is null) return NotFound();
        // Deleting a recorded visit also takes it off the lead's visit count. Status and follow-up are not rewound; edit the lead for that.
        if (a.Type == "Visit" && a.LeadId != null && await db.Leads.FindAsync(a.LeadId) is { } lead) lead.Visits = Math.Max(0, lead.Visits - 1);
        db.Activities.Remove(a);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
