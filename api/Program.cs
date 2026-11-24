using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using SivayaanCrm.Api.Data;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers().AddJsonOptions(o =>
{
    o.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
});
builder.Services.AddDbContext<CrmDb>(o => o.UseSqlite(builder.Configuration.GetConnectionString("Crm") ?? "Data Source=crm.db"));
// Browsers only let the web app call this API from an origin listed here. Local dev origins are always allowed;
// production origins come from configuration (appsettings.json "Cors:AllowedOrigins", or the environment variable
// Cors__AllowedOrigins__0, Cors__AllowedOrigins__1, ...). An origin is scheme + host (+ port), with no path or trailing slash.
var allowedOrigins = new[] { "http://localhost:5173", "http://127.0.0.1:5173" }
    .Concat(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
    .Select(o => o.Trim().TrimEnd('/'))
    .Where(o => o.Length > 0)
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
using (var scope = app.Services.CreateScope())
    Seeder.Run(scope.ServiceProvider.GetRequiredService<CrmDb>(), Path.Combine(AppContext.BaseDirectory, "Data", "seed.json"));

app.UseCors();
app.MapControllers();
app.Run();
