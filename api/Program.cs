using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;
using SivayaanCrm.Api.Controllers;
using Microsoft.EntityFrameworkCore;
using SivayaanCrm.Api.Data;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers().AddJsonOptions(o =>
{
    o.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
});
// Database location: a full ConnectionStrings:Crm wins; otherwise Database:Path (appsettings or env var Database__Path),
// default "crm.db". A relative path is relative to the process's working directory, as before; on a server use an absolute
// path outside the deployment folder (e.g. D:\crm-data\crm.db) so redeploys don't replace the data.
var dbPath = builder.Configuration["Database:Path"] is { Length: > 0 } p ? p : "crm.db";
var connectionString = builder.Configuration.GetConnectionString("Crm") ?? $"Data Source={dbPath}";
builder.Services.AddDbContext<CrmDb>(o => o.UseSqlite(connectionString));
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

// Login: every endpoint requires a signed token except /api/auth/login. Credentials come from configuration
// (Auth:Username / Auth:Password, or env vars Auth__Username / Auth__Password) so they never live in the code.
// Auth:JwtKey (any long random text) keeps users signed in across restarts; without it a key is generated at startup.
if (builder.Environment.IsProduction() && (string.IsNullOrEmpty(builder.Configuration["Auth:Username"]) || string.IsNullOrEmpty(builder.Configuration["Auth:Password"])))
    throw new InvalidOperationException("Set Auth:Username and Auth:Password in appsettings.Production.json (or Auth__Username / Auth__Password environment variables) before starting the API.");
var jwtKeyText = builder.Configuration["Auth:JwtKey"];
var authSettings = new AuthSettings
{
    Key = new SymmetricSecurityKey(string.IsNullOrEmpty(jwtKeyText) ? RandomNumberGenerator.GetBytes(32) : SHA256.HashData(Encoding.UTF8.GetBytes(jwtKeyText))),
    Lifetime = TimeSpan.FromHours(builder.Configuration.GetValue("Auth:TokenHours", 12)),
};
builder.Services.AddSingleton(authSettings);
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.TokenValidationParameters = new TokenValidationParameters
    {
        IssuerSigningKey = authSettings.Key,
        ValidateIssuer = false, ValidateAudience = false, ValidateLifetime = true,
        ClockSkew = TimeSpan.FromMinutes(1),
    };
});
builder.Services.AddAuthorization(o => o.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

var app = builder.Build();
// Logged at startup so a misconfigured deployment (wrong database, missing CORS origin) is easy to spot in the logs.
app.Logger.LogInformation("Environment: {Env}. CORS allowed origins: {Origins}", app.Environment.EnvironmentName, string.Join(", ", allowedOrigins));
if (builder.Configuration.GetConnectionString("Crm") is null) app.Logger.LogInformation("Database file: {Path}", Path.GetFullPath(dbPath));
using (var scope = app.Services.CreateScope())
    Seeder.Run(scope.ServiceProvider.GetRequiredService<CrmDb>(), Path.Combine(AppContext.BaseDirectory, "Data", "seed.json"));

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();
