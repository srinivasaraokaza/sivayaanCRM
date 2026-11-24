using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using SivayaanCrm.Api.Data;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers().AddJsonOptions(o =>
{
    o.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
});
builder.Services.AddDbContext<CrmDb>(o => o.UseSqlite(builder.Configuration.GetConnectionString("Crm") ?? "Data Source=crm.db"));
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins("http://localhost:5173", "http://127.0.0.1:5173").AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
using (var scope = app.Services.CreateScope())
    Seeder.Run(scope.ServiceProvider.GetRequiredService<CrmDb>(), Path.Combine(AppContext.BaseDirectory, "Data", "seed.json"));

app.UseCors();
app.MapControllers();
app.Run();
