namespace SivayaanCrm.Api.Models;

/// <summary>What happened at a field visit. Status = the lead status it moves the lead to (null = leave as is);
/// FollowUpDays = default days until the next follow-up (0 = none, e.g. not interested).</summary>
public record VisitOutcome(string Code, string Label, string? Status, int FollowUpDays, string? NextAction, string Tone);

public static class Stages
{
    public static readonly VisitOutcome[] VisitOutcomes =
    [
        new("INTERESTED", "Interested", "Qualified", 3, "Follow up on their interest", "good"),
        new("DEMO", "Requested a demo", "Qualified", 2, "Schedule and give the demo", "good"),
        new("QUOTE", "Asked for pricing / quote", "Qualified", 2, "Send quotation", "good"),
        new("FOLLOWUP", "Requested a follow-up", "Contacted", 7, "Follow up as requested", "warn"),
        new("DETAILS", "Requested more details", "Contacted", 2, "Send product details", "warn"),
        new("CLARIFY", "Requested clarification", "Contacted", 2, "Send the clarification they asked for", "warn"),
        new("NOT_AVAILABLE", "Decision maker not available", "Contacted", 1, "Revisit and meet the decision maker", "warn"),
        new("CLOSED", "Facility closed", null, 1, "Revisit when open", "warn"),
        new("HAS_SOFTWARE", "Already using other software", "Contacted", 30, "Revisit later", "neutral"),
        new("NOT_INTERESTED", "Not interested", "Unqualified", 0, null, "bad"),
        new("OTHER", "Other", "Contacted", 3, null, "neutral"),
    ];
    public static int StatusRank(string? s) => s switch { "New" => 0, "Contacted" => 1, "Qualified" => 2, _ => -1 };

    public static readonly string[] All = ["Prospecting", "Qualified", "Demo", "Proposal", "Negotiation", "Won", "Lost"];
    public static readonly string[] LeadStatuses = ["New", "Contacted", "Qualified", "Unqualified"];
    // "Source" doubles as the lead platform in the dashboard charts.
    public static readonly string[] LeadSources = ["WhatsApp", "Website", "Instagram", "Facebook", "Google Ads", "IndiaMART", "JustDial", "Referral", "Field visit", "Cold call", "Campaign", "Other"];
}

/// <summary>A product Sivayaan sells (HMS, Lorrywowner.com, COPs, ABPS, Geethvaweaves...). Leads and deals belong to a product.</summary>
public class Product
{
    public int Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Industry { get; set; }
    public string? Description { get; set; }
    public string? Website { get; set; }
    public decimal DefaultDealValue { get; set; }
    public string? Segments { get; set; } // comma-separated customer types for bulk deals, e.g. "Clinic,Pharmacy,Lab"
    public string Color { get; set; } = "#1f4fd8";
    public bool IsActive { get; set; } = true;
}

public class Account
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Industry { get; set; }
    public string? Email { get; set; }
    public string? City { get; set; }
    public string? Category { get; set; }
    public string? Landmark { get; set; }
    public string? Phone { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public double? DistanceKm { get; set; }
    public string? Website { get; set; }
    public string? WebsiteWorks { get; set; }
    public string? Tier { get; set; }
    public int Opportunity { get; set; }
    public string? OpportunityBand { get; set; }
    public int DigitalMaturity { get; set; }
    public string? MaturityBand { get; set; }
    public string? CompetitivePosition { get; set; }
    public string? Summary { get; set; }
    public string? TopRecommendation { get; set; }
    public List<Recommendation> Recommendations { get; set; } = [];
    public List<Contact> Contacts { get; set; } = [];
    public List<Deal> Deals { get; set; } = [];
    public List<Activity> Activities { get; set; } = [];
    public List<Lead> Leads { get; set; } = [];
    public List<Order> Orders { get; set; } = [];
}

/// <summary>A sale to a customer. Drives revenue, top-selling and the Active / At Risk / Lost customer status.</summary>
public class Order
{
    public int Id { get; set; }
    public string AccountId { get; set; } = "";
    public Account? Account { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public string? Item { get; set; } // what was sold, e.g. "Kanchipuram saree"; blank = the product itself
    public int Quantity { get; set; } = 1;
    public decimal Amount { get; set; }
    public DateTime OrderDate { get; set; }
    public string? Notes { get; set; }
}

public class Lead
{
    public int Id { get; set; }
    public string AccountId { get; set; } = "";
    public Account? Account { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public string? Source { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string Status { get; set; } = "New";
    public string Priority { get; set; } = "Medium";
    public string? NextAction { get; set; }
    public DateTime? FollowUpDate { get; set; }
    public DateTime? LastContactDate { get; set; }
    public int Visits { get; set; }
    public string? Notes { get; set; }
    public string? CurrentSoftware { get; set; }
    public string? Competitor { get; set; }
    public bool Converted { get; set; }
}

public class Contact
{
    public int Id { get; set; }
    public string AccountId { get; set; } = "";
    public Account? Account { get; set; }
    public string Name { get; set; } = "";
    public string? Title { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public bool IsDecisionMaker { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Deal
{
    public int Id { get; set; }
    public string AccountId { get; set; } = "";
    public Account? Account { get; set; }
    public string Title { get; set; } = "";
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public string? Module { get; set; } // package / module / plan within the product
    public string? Segment { get; set; } // customer type for bulk deals: Clinic, Pharmacy, Lab...
    public int Units { get; set; } = 1; // number of sites / seats; 2+ is a bulk deal
    public decimal Value { get; set; }
    public string Stage { get; set; } = "Prospecting";
    public int CloseProbability { get; set; } = 10;
    public DateTime? ExpectedCloseDate { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class Activity
{
    public int Id { get; set; }
    public string AccountId { get; set; } = "";
    public Account? Account { get; set; }
    public int? DealId { get; set; }
    public int? LeadId { get; set; } // the lead (product) a visit was recorded against
    public string? Outcome { get; set; } // visit outcome code, see Stages.VisitOutcomes
    public string Type { get; set; } = "Note"; // Call, Visit, Email, Meeting, WhatsApp, Note
    public string Subject { get; set; } = "";
    public string? Notes { get; set; }
    public DateTime Date { get; set; } = DateTime.UtcNow;
}

public class Recommendation
{
    public int Id { get; set; }
    public string AccountId { get; set; } = "";
    public string? Priority { get; set; }
    public string? Category { get; set; }
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public string? SuggestedAction { get; set; }
    public string? ExpectedImpact { get; set; }
    public string? Effort { get; set; }
    public string? Modules { get; set; }
}
