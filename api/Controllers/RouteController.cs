using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SivayaanCrm.Api.Data;

namespace SivayaanCrm.Api.Controllers;

/// <summary>Facilities to visit (open leads with map coordinates) for the route planner.</summary>
[ApiController, Route("api/route")]
public class RouteController(CrmDb db) : ControllerBase
{
    const int MaxStops = 1000;

    [HttpGet("stops")]
    public async Task<object> Stops(int? productId, string? area, string? category, string? priority, bool unvisitedOnly = false)
    {
        // Facilities visited today stay in the result (flagged visitedToday) even after the visit closes the lead or
        // takes it off the "not visited" list, so a recorded visit never just disappears from the screen.
        var todayStartUtc = Rules.Today().AddMinutes(-Rules.UtcOffsetMinutes);
        var visitedToday = (await db.Activities.AsNoTracking().Where(a => a.Type == "Visit" && a.Date >= todayStartUtc).Select(a => a.AccountId).Distinct().ToListAsync()).ToHashSet();

        var baseQ = db.Leads.AsNoTracking()
            .Where(l => ((!l.Converted && l.Status != "Unqualified") || visitedToday.Contains(l.AccountId))
                        && l.Account!.Latitude != null && l.Account.Longitude != null
                        && (productId == null || l.ProductId == productId));

        // Filter option lists come from the product-level set, so choosing an area doesn't hide the other areas.
        var facets = await baseQ.Select(l => new { l.AccountId, area = l.Account!.Landmark ?? l.Account.City, cat = l.Account.Category ?? l.Account.Industry }).ToListAsync();
        var areas = facets.GroupBy(f => f.AccountId).Select(g => g.First()).Where(f => f.area != null).GroupBy(f => f.area!)
            .Select(g => new { name = g.Key, count = g.Count() }).OrderByDescending(a => a.count).ThenBy(a => a.name).ToList();
        var categories = facets.GroupBy(f => f.AccountId).Select(g => g.First()).Where(f => f.cat != null).GroupBy(f => f.cat!)
            .Select(g => new { name = g.Key, count = g.Count() }).OrderByDescending(a => a.count).ThenBy(a => a.name).ToList();

        var q = baseQ;
        if (!string.IsNullOrEmpty(area)) q = q.Where(l => (l.Account!.Landmark ?? l.Account.City) == area);
        if (!string.IsNullOrEmpty(category)) q = q.Where(l => (l.Account!.Category ?? l.Account.Industry) == category);
        if (!string.IsNullOrEmpty(priority)) q = q.Where(l => l.Priority == priority);
        if (unvisitedOnly) q = q.Where(l => l.Visits == 0 || visitedToday.Contains(l.AccountId));

        var rows = await q.Select(l => new
        {
            leadId = l.Id, l.AccountId, name = l.Account!.Name, category = l.Account.Category ?? l.Account.Industry, landmark = l.Account.Landmark ?? l.Account.City,
            phone = l.Account.Phone, latitude = l.Account.Latitude, longitude = l.Account.Longitude, l.Priority, l.Visits, l.LastContactDate,
            product = l.Product!.Name, productColor = l.Product.Color, l.NextAction, leadStatus = l.Status, l.FollowUpDate
        }).ToListAsync();

        // One stop per customer even if it has leads for several products.
        var stops = rows.GroupBy(r => r.AccountId).Select(g => g.OrderBy(r => r.Priority == "Critical" ? 0 : r.Priority == "High" ? 1 : r.Priority == "Medium" ? 2 : 3).First()).Take(MaxStops).ToList();

        // Most recent recorded visit per facility, so each row can show "last visit: Interested, 3 days ago".
        var ids = stops.Select(s => s.AccountId).ToList();
        var visits = await db.Activities.AsNoTracking().Where(a => a.Type == "Visit" && ids.Contains(a.AccountId))
            .Select(a => new { a.AccountId, a.Date, a.Outcome, a.Notes }).ToListAsync();
        var last = visits.GroupBy(v => v.AccountId).ToDictionary(g => g.Key, g => g.OrderByDescending(v => v.Date).First());

        var items = stops.Select(s => new
        {
            s.leadId, s.AccountId, s.name, s.category, s.landmark, s.phone, s.latitude, s.longitude, s.Priority, s.Visits, s.LastContactDate,
            s.product, s.productColor, s.NextAction, s.leadStatus, s.FollowUpDate,
            visitedToday = visitedToday.Contains(s.AccountId),
            lastVisitAt = last.TryGetValue(s.AccountId, out var v) ? (DateTime?)v.Date : null,
            lastOutcome = last.TryGetValue(s.AccountId, out var v2) ? v2.Outcome : null,
            lastVisitNotes = last.TryGetValue(s.AccountId, out var v3) ? v3.Notes : null
        }).ToList();
        return new { total = items.Count, truncated = rows.Select(r => r.AccountId).Distinct().Count() > MaxStops, items, areas, categories };
    }
}
