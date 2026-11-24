using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SivayaanCrm.Api.Data;
using SivayaanCrm.Api.Models;

namespace SivayaanCrm.Api.Controllers;

/// <summary>Records a field visit with its outcome and updates the lead (status, next action, follow-up) accordingly.</summary>
[ApiController, Route("api/visits")]
public class VisitsController(CrmDb db) : ControllerBase
{
    public record VisitRequest(string AccountId, int? LeadId, string Outcome, string? Notes, string? ContactName, string? ContactPhone,
        bool? DecisionMaker, DateTime? FollowUpDate, string? NextAction, string? CurrentSoftware, string? ContactEmail = null);

    [HttpPost]
    public async Task<IActionResult> Record(VisitRequest r)
    {
        var outcome = Stages.VisitOutcomes.FirstOrDefault(o => o.Code == r.Outcome);
        if (outcome is null) return BadRequest("Choose what happened at the visit.");
        var account = await db.Accounts.FindAsync(r.AccountId);
        if (account is null) return BadRequest("Facility not found.");

        // The lead (product) this visit is about: the one given, else the account's only open lead.
        Lead? lead = null;
        if (r.LeadId != null)
        {
            lead = await db.Leads.FirstOrDefaultAsync(l => l.Id == r.LeadId && l.AccountId == r.AccountId);
            if (lead is null) return BadRequest("That lead does not belong to this facility.");
        }
        else
        {
            var open = await db.Leads.Where(l => l.AccountId == r.AccountId && !l.Converted).ToListAsync();
            if (open.Count == 1) lead = open[0];
        }

        var now = DateTime.UtcNow;
        var notes = string.IsNullOrWhiteSpace(r.Notes) ? null : r.Notes.Trim();
        var met = string.IsNullOrWhiteSpace(r.ContactName) ? null : r.ContactName.Trim();
        db.Activities.Add(new Activity
        {
            AccountId = account.Id, LeadId = lead?.Id, Type = "Visit", Outcome = outcome.Code, Date = now,
            Subject = $"Visit: {outcome.Label}" + (met is null ? "" : $" (met {met})"), Notes = notes
        });

        DateTime? followUp = null;
        if (lead is not null)
        {
            lead.Visits++;
            lead.LastContactDate = now;
            if (!lead.Converted)
            {
                // Status only moves forward (New > Contacted > Qualified); "Not interested" closes it, and a later positive visit reopens it.
                if (outcome.Status == "Unqualified") lead.Status = "Unqualified";
                else if (outcome.Status is not null && Stages.StatusRank(outcome.Status) > Stages.StatusRank(lead.Status)) lead.Status = outcome.Status;

                followUp = r.FollowUpDate?.Date ?? (outcome.FollowUpDays > 0 ? Rules.Today().AddDays(outcome.FollowUpDays) : null);
                // A closed lead has no follow-up unless the user explicitly set one (e.g. "call back in 3 months").
                lead.FollowUpDate = followUp;
                lead.NextAction = string.IsNullOrWhiteSpace(r.NextAction) ? outcome.NextAction : r.NextAction.Trim();
                if (!string.IsNullOrWhiteSpace(r.CurrentSoftware)) lead.CurrentSoftware = r.CurrentSoftware.Trim();
            }
        }

        // Capture who was met, so the next visit knows who to ask for.
        var phone = string.IsNullOrWhiteSpace(r.ContactPhone) ? null : r.ContactPhone.Trim();
        var email = string.IsNullOrWhiteSpace(r.ContactEmail) ? null : r.ContactEmail.Trim();
        if (email is not null && !System.Text.RegularExpressions.Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$")) return BadRequest("That email address doesn't look valid.");
        if (met is not null)
        {
            var existing = await db.Contacts.FirstOrDefaultAsync(c => c.AccountId == account.Id && c.Name.ToLower() == met.ToLower());
            if (existing is null)
                db.Contacts.Add(new Contact { AccountId = account.Id, Name = met, Phone = phone, Email = email, IsDecisionMaker = r.DecisionMaker ?? false });
            else
            {
                // Same person met again: fill in any details we didn't have, never overwrite.
                existing.Phone ??= phone; existing.Email ??= email;
                if (r.DecisionMaker == true) existing.IsDecisionMaker = true;
            }
        }
        else if (email is not null && string.IsNullOrWhiteSpace(account.Email)) account.Email = email;

        await db.SaveChangesAsync();
        return Ok(new { outcome = outcome.Label, leadStatus = lead?.Status, followUpDate = followUp, nextAction = lead?.NextAction });
    }
}
