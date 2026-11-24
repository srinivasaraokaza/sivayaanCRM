using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;

namespace SivayaanCrm.Api.Controllers;

public record LoginRequest(string? Username, string? Password);

/// <summary>Signing key and lifetime for login tokens, shared by Program.cs (validation) and AuthController (issuing).</summary>
public class AuthSettings
{
    public required SymmetricSecurityKey Key { get; init; }
    public TimeSpan Lifetime { get; init; } = TimeSpan.FromHours(12);
}

[ApiController]
[AllowAnonymous]
[Route("api/auth")]
public class AuthController(IConfiguration config, AuthSettings settings) : ControllerBase
{
    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest req)
    {
        var user = config["Auth:Username"] ?? "";
        var pass = config["Auth:Password"] ?? "";
        var ok = Same(req.Username ?? "", user) & Same(req.Password ?? "", pass) && user.Length > 0 && pass.Length > 0;
        if (!ok)
        {
            await Task.Delay(700); // slows down password guessing
            return Unauthorized(new { error = "Incorrect username or password." });
        }
        var expires = DateTime.UtcNow.Add(settings.Lifetime);
        var token = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            claims: [new Claim(ClaimTypes.Name, user)],
            expires: expires,
            signingCredentials: new SigningCredentials(settings.Key, SecurityAlgorithms.HmacSha256)));
        return Ok(new { token, expires, username = user });
    }

    // Constant-time comparison so response time doesn't reveal how much of a guess was right.
    private static bool Same(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(a)), SHA256.HashData(Encoding.UTF8.GetBytes(b)));
}
