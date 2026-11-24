using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SivayaanCrm.Api.Data;

namespace SivayaanCrm.Api.Controllers;

/// <summary>Open leads grouped by how they can be reached digitally: a WhatsApp-capable mobile number, or an email address.</summary>
[ApiController, Route("api/reach")]
public class ReachController(CrmDb db) : ControllerBase
{
    static readonly Regex EmailRx = new(@"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.Compiled);

    /// <summary>Returns the 10-digit Indian mobile number inside a phone string, or null for landlines and anything else.</summary>
    public static string? Mobile(string? phone)
    {
        var d = Regex.Replace(phone ?? "", @"\D", "");
        if (d.StartsWith("00")) d = d[2..];
        if (d.Length == 12 && d.StartsWith("91")) d = d[2..];
        else if (d.Length == 11 && d.StartsWith('0')) d = d[1..];
        return d.Length == 10 && "6789".Contains(d[0]) ? d : null;
    }

    [HttpGet]
    public async Task<object> List(string channel = "whatsapp", int? productId = null, string? search = null, string? priority = null, int page = 1, int pageSize = 25)
    {
        var leads = await db.Leads.AsNoTracking()
            .Where(l => !l.Converted && l.Status != "Unqualified" && (productId == null || l.ProductId == productId))
            .Select(l => new
            {
                l.Id, l.AccountId, account = l.Account!.Name, category = l.Account.Category ?? l.Account.Industry, landmark = l.Account.Landmark ?? l.Account.City,
                product = l.Product!.Name, productColor = l.Product.Color, l.Priority, l.Status, l.NextAction, l.FollowUpDate, l.LastContactDate, l.Source,
                phone = l.Account.Phone, email = l.Account.Email,
                contacts = l.Account.Contacts.OrderByDescending(c => c.IsDecisionMaker).Select(c => new { c.Name, c.Phone, c.Email }).ToList()
            }).ToListAsync();

        var rows = leads.Select(l =>
        {
            // Prefer a named contact's mobile/email (so the message can greet them), else the business's own.
            var cm = l.contacts.FirstOrDefault(c => Mobile(c.Phone) != null);
            var ce = l.contacts.FirstOrDefault(c => c.Email != null && EmailRx.IsMatch(c.Email.Trim()));
            var mobile = cm is not null ? Mobile(cm.Phone) : Mobile(l.phone);
            var email = ce?.Email?.Trim() ?? (l.email != null && EmailRx.IsMatch(l.email.Trim()) ? l.email.Trim() : null);
            return new
            {
                leadId = l.Id, l.AccountId, l.account, l.category, l.landmark, l.product, l.productColor, l.Priority, l.Status, l.NextAction, l.FollowUpDate, l.LastContactDate, l.Source,
                whatsapp = mobile, whatsappContact = cm?.Name, email, emailContact = ce?.Name,
                hasLandline = mobile == null && !string.IsNullOrWhiteSpace(l.phone) || l.contacts.Any(c => !string.IsNullOrWhiteSpace(c.Phone))
            };
        }).ToList();

        var counts = new
        {
            whatsapp = rows.Count(r => r.whatsapp != null),
            email = rows.Count(r => r.email != null),
            both = rows.Count(r => r.whatsapp != null && r.email != null),
            neither = rows.Count(r => r.whatsapp == null && r.email == null),
            landlineOnly = rows.Count(r => r.whatsapp == null && r.email == null && r.hasLandline),
            total = rows.Count
        };

        var q = rows.Where(r => channel == "email" ? r.email != null : r.whatsapp != null);
        if (!string.IsNullOrWhiteSpace(search)) q = q.Where(r => r.account.Contains(search, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrEmpty(priority)) q = q.Where(r => r.Priority == priority);
        var ordered = q.OrderBy(r => r.Priority == "Critical" ? 0 : r.Priority == "High" ? 1 : r.Priority == "Medium" ? 2 : 3).ThenBy(r => r.FollowUpDate ?? DateTime.MaxValue).ThenBy(r => r.account).ToList();
        pageSize = Math.Clamp(pageSize, 1, 100);
        return new { total = ordered.Count, page, pageSize, counts, items = ordered.Skip((Math.Max(page, 1) - 1) * pageSize).Take(pageSize) };
    }
}
