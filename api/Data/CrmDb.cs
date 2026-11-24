using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SivayaanCrm.Api.Models;

namespace SivayaanCrm.Api.Data;

public class CrmDb(DbContextOptions<CrmDb> options) : DbContext(options)
{
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Lead> Leads => Set<Lead>();
    public DbSet<Contact> Contacts => Set<Contact>();
    public DbSet<Deal> Deals => Set<Deal>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<Activity> Activities => Set<Activity>();
    public DbSet<Recommendation> Recommendations => Set<Recommendation>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Account>().HasMany(a => a.Leads).WithOne(l => l.Account).HasForeignKey(l => l.AccountId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Account>().HasMany(a => a.Orders).WithOne(o => o.Account).HasForeignKey(o => o.AccountId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Order>().HasOne(o => o.Product).WithMany().HasForeignKey(o => o.ProductId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Order>().Property(o => o.Amount).HasConversion<double>();
        b.Entity<Order>().HasIndex(o => o.OrderDate);
        b.Entity<Lead>().HasOne(l => l.Product).WithMany().HasForeignKey(l => l.ProductId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Deal>().HasOne(d => d.Product).WithMany().HasForeignKey(d => d.ProductId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Lead>().HasIndex(l => new { l.AccountId, l.ProductId });
        b.Entity<Product>().HasIndex(p => p.Code).IsUnique();
        b.Entity<Product>().Property(p => p.DefaultDealValue).HasConversion<double>();
        b.Entity<Account>().HasMany(a => a.Contacts).WithOne(c => c.Account).HasForeignKey(c => c.AccountId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Account>().HasMany(a => a.Deals).WithOne(c => c.Account).HasForeignKey(c => c.AccountId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Account>().HasMany(a => a.Activities).WithOne(c => c.Account).HasForeignKey(c => c.AccountId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Account>().HasMany(a => a.Recommendations).WithOne().HasForeignKey(r => r.AccountId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Account>().HasIndex(a => a.Name);
        b.Entity<Account>().HasIndex(a => a.Opportunity);
        b.Entity<Deal>().Property(d => d.Value).HasConversion<double>();
    }
}

public static class Seeder
{
    record SeedRec(string? Priority, string? Category, string Title, string? Description, string? SuggestedAction, string? ExpectedImpact, string? Effort, string? Modules);
    record SeedAcc(string Id, string Name, string? Category, string? Landmark, string? Phone, double? Lat, double? Lng, double? DistanceKm,
        string? Website, string? WebsiteWorks, string? Tier, int Opportunity, string? OpportunityBand, int DigitalMaturity, string? MaturityBand,
        string? CompetitivePosition, string? Summary, string? TopRecommendation, string Priority, string? NextAction, string? FollowUp, List<SeedRec> Recommendations);

    static void AddColumnIfMissing(CrmDb db, string table, string column, string type)
    {
        var conn = db.Database.GetDbConnection();
        var wasClosed = conn.State != System.Data.ConnectionState.Open;
        if (wasClosed) conn.Open();
        try
        {
            using var check = conn.CreateCommand();
            check.CommandText = $"SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name = '{column}'";
            if (Convert.ToInt32(check.ExecuteScalar()) > 0) return;
            using var alter = conn.CreateCommand();
            alter.CommandText = $"ALTER TABLE \"{table}\" ADD COLUMN \"{column}\" {type} NULL";
            alter.ExecuteNonQuery();
        }
        finally { if (wasClosed) conn.Close(); }
    }

    public static void Run(CrmDb db, string seedPath)
    {
        db.Database.EnsureCreated();
        // EnsureCreated never alters an existing database, so add columns introduced after it was first created.
        AddColumnIfMissing(db, "Activities", "Outcome", "TEXT");
        AddColumnIfMissing(db, "Activities", "LeadId", "INTEGER");
        if (!db.Products.Any())
        {
            db.Products.AddRange(
                new Product { Code = "HMS", Name = "HMS", Industry = "Healthcare", Description = "Hospital & clinic management system, website, WhatsApp, patient portal, ABDM", DefaultDealValue = 150000, Segments = "Clinic,Pharmacy,Lab,Hospital", Color = "#1f4fd8" },
                new Product { Code = "LORRY", Name = "Lorrywowner.com", Industry = "Transport & Logistics", Description = "Lorry owners and load marketplace", Website = "https://lorrywowner.com", DefaultDealValue = 25000, Color = "#d97706" },
                new Product { Code = "COPS", Name = "COPs", Industry = "Real Estate", Description = "Real estate management platform", DefaultDealValue = 100000, Color = "#0f766e" },
                new Product { Code = "ABPS", Name = "ABPS", Industry = "Hospitality", Description = "Room booking platform", DefaultDealValue = 60000, Color = "#7c3aed" },
                new Product { Code = "GEETHVA", Name = "Geethvaweaves", Industry = "E-commerce", Description = "Handloom e-commerce store", DefaultDealValue = 20000, Color = "#be185d" });
            db.SaveChanges();
        }
        var hmsId = db.Products.Where(p => p.Code == "HMS").Select(p => p.Id).First();
        if (db.Accounts.Any() || !File.Exists(seedPath)) return;
        var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        var items = JsonSerializer.Deserialize<List<SeedAcc>>(File.ReadAllText(seedPath), opts)!;
        foreach (var s in items)
        {
            db.Accounts.Add(new Account
            {
                Id = s.Id, Name = s.Name, Industry = "Healthcare", City = "Hyderabad", Category = s.Category, Landmark = s.Landmark, Phone = s.Phone, Latitude = s.Lat, Longitude = s.Lng,
                DistanceKm = s.DistanceKm, Website = s.Website, WebsiteWorks = s.WebsiteWorks, Tier = s.Tier, Opportunity = s.Opportunity,
                OpportunityBand = s.OpportunityBand, DigitalMaturity = s.DigitalMaturity, MaturityBand = s.MaturityBand,
                CompetitivePosition = s.CompetitivePosition, Summary = s.Summary, TopRecommendation = s.TopRecommendation,
                Recommendations = s.Recommendations.Select(r => new Recommendation
                {
                    Priority = r.Priority, Category = r.Category, Title = r.Title, Description = r.Description,
                    SuggestedAction = r.SuggestedAction, ExpectedImpact = r.ExpectedImpact, Effort = r.Effort, Modules = r.Modules
                }).ToList(),
                Leads = [new Lead
                {
                    ProductId = hmsId, Source = "Field visit", Status = "New", Priority = s.Priority, NextAction = s.NextAction,
                    // Workbook follow-up dates are stale; stagger from seed day by priority instead.
                    FollowUpDate = SivayaanCrm.Api.Controllers.Rules.Today().AddDays(s.Priority switch { "Critical" => 1, "High" => 3, "Medium" => 7, _ => 14 })
                }]
            });
        }
        db.SaveChanges();
    }
}
