using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SivayaanCrm.Api.Data;
using SivayaanCrm.Api.Models;

namespace SivayaanCrm.Api.Controllers;

[ApiController, Route("api/import")]
public class ImportController(CrmDb db) : ControllerBase
{
    public record ImportRow(string? Name, string? ContactName, string? Phone, string? Email, string? City, string? Industry, string? Category,
        string? Website, string? Source, string? Priority, string? NextAction, string? FollowUpDate, string? Notes,
        string? Latitude = null, string? Longitude = null);

    static double? Coord(string? s, double limit) =>
        double.TryParse(s?.Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var v) && Math.Abs(v) <= limit ? v : null;

    public record ImportRequest(int ProductId, string? DefaultSource, bool DryRun, List<ImportRow> Rows);

    public record RowIssue(int Row, string Name, string Reason);

    const int MaxRows = 5000;

    static string Digits(string? s) => Regex.Replace(s ?? "", @"\D", "");
    // Compare phones on the last 10 digits so "+91 98480-12345" matches "9848012345".
    static string PhoneKey(string? s) { var d = Digits(s); return d.Length > 10 ? d[^10..] : d; }
    static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
    static string NormPriority(string? p) => (p ?? "").Trim().ToLowerInvariant() switch
    {
        "critical" or "urgent" => "Critical", "high" or "hot" => "High", "low" or "cold" => "Low", _ => "Medium"
    };

    [HttpPost("leads")]
    [RequestSizeLimit(30_000_000)]
    public async Task<IActionResult> Leads(ImportRequest req)
    {
        var product = await db.Products.FindAsync(req.ProductId);
        if (product is null) return BadRequest("Choose a product.");
        if (req.Rows is null || req.Rows.Count == 0) return BadRequest("The file has no rows.");
        if (req.Rows.Count > MaxRows) return BadRequest($"Import at most {MaxRows} rows at a time.");

        // Index existing customers so rows attach to them instead of creating duplicates.
        var existing = await db.Accounts.AsNoTracking().Select(a => new { a.Id, a.Name, a.Phone, a.Email, a.City }).ToListAsync();
        var byPhone = new Dictionary<string, string>();
        var byEmail = new Dictionary<string, string>();
        var byNameCity = new Dictionary<string, string>();
        void Index(string id, string name, string? phone, string? email, string? city)
        {
            var pk = PhoneKey(phone);
            if (pk.Length >= 7) byPhone.TryAdd(pk, id);
            if (!string.IsNullOrWhiteSpace(email)) byEmail.TryAdd(email.Trim().ToLowerInvariant(), id);
            if (!string.IsNullOrWhiteSpace(city)) byNameCity.TryAdd($"{name.Trim().ToLowerInvariant()}|{city.Trim().ToLowerInvariant()}", id);
        }
        foreach (var a in existing) Index(a.Id, a.Name, a.Phone, a.Email, a.City);

        var openLeadAccounts = (await db.Leads.Where(l => l.ProductId == product.Id && !l.Converted).Select(l => l.AccountId).ToListAsync()).ToHashSet();
        var dealAccounts = (await db.Deals.Where(d => d.ProductId == product.Id && d.Stage != "Lost").Select(d => d.AccountId).ToListAsync()).ToHashSet();

        int created = 0, linked = 0, newAccounts = 0;
        var skipped = new List<RowIssue>();
        var errors = new List<RowIssue>();
        var today = Rules.Today();

        for (var i = 0; i < req.Rows.Count; i++)
        {
            var r = req.Rows[i];
            var rowNo = i + 2; // spreadsheet row number: header is row 1
            var name = Clean(r.Name);
            if (name is null) { errors.Add(new RowIssue(rowNo, "", "Missing business / customer name")); continue; }
            var email = Clean(r.Email);
            if (email is not null && !Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$")) { errors.Add(new RowIssue(rowNo, name, $"Invalid email '{email}'")); continue; }

            string? accountId = null;
            var pk = PhoneKey(r.Phone);
            if (pk.Length >= 7 && byPhone.TryGetValue(pk, out var idP)) accountId = idP;
            else if (email is not null && byEmail.TryGetValue(email.ToLowerInvariant(), out var idE)) accountId = idE;
            else if (Clean(r.City) is { } city && byNameCity.TryGetValue($"{name.ToLowerInvariant()}|{city.ToLowerInvariant()}", out var idN)) accountId = idN;

            if (accountId is not null && (openLeadAccounts.Contains(accountId) || dealAccounts.Contains(accountId)))
            {
                skipped.Add(new RowIssue(rowNo, name, $"Already has an open {product.Name} lead or deal"));
                continue;
            }

            if (accountId is null)
            {
                accountId = Rules.NewAccountId();
                newAccounts++;
                Index(accountId, name, r.Phone, email, r.City);
                if (!req.DryRun)
                {
                    db.Accounts.Add(new Account
                    {
                        Id = accountId, Name = name, Phone = Clean(r.Phone), Email = email, City = Clean(r.City), Category = Clean(r.Category),
                        Website = Clean(r.Website), Industry = Clean(r.Industry) ?? product.Industry,
                        // Keep a coordinate pair only if both parts are valid.
                        Latitude = Coord(r.Latitude, 90) is not null && Coord(r.Longitude, 180) is not null ? Coord(r.Latitude, 90) : null,
                        Longitude = Coord(r.Latitude, 90) is not null && Coord(r.Longitude, 180) is not null ? Coord(r.Longitude, 180) : null
                    });
                    if (Clean(r.ContactName) is { } cn)
                        db.Contacts.Add(new Contact { AccountId = accountId, Name = cn, Phone = Clean(r.Phone), Email = email, IsDecisionMaker = true });
                }
            }
            else linked++;

            DateTime? follow = DateTime.TryParse(r.FollowUpDate, out var fd) ? DateTime.SpecifyKind(fd.Date, DateTimeKind.Utc) : null;
            if (!req.DryRun)
                db.Leads.Add(new Lead
                {
                    AccountId = accountId, ProductId = product.Id, Source = Clean(r.Source) ?? Clean(req.DefaultSource) ?? "Import",
                    Priority = NormPriority(r.Priority), NextAction = Clean(r.NextAction), Notes = Clean(r.Notes), FollowUpDate = follow ?? today.AddDays(1)
                });
            openLeadAccounts.Add(accountId);
            created++;
        }

        if (!req.DryRun && created > 0) await db.SaveChangesAsync();
        return Ok(new
        {
            dryRun = req.DryRun, product = product.Name, total = req.Rows.Count, created, newAccounts, linkedToExisting = linked,
            skipped = skipped.Count, errors = errors.Count, skippedRows = skipped.Take(200), errorRows = errors.Take(200)
        });
    }
}
