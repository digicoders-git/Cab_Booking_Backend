$baseUrl = "http://localhost:5000/api"
$adminEmail = "admin@example.com"
$adminPassword = "newpassword123"

# 1. Login to get Token
$loginBody = @{
    email = $adminEmail
    password = $adminPassword
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri "$baseUrl/admin/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginResponse.token

Write-Host "Login Successful. Token received." -ForegroundColor Green

# 2. Create Notification
$notifBody = @{
    title = "Test Notification from Script"
    message = "Bhai notification check ho raha hai curl se!"
    targetRoles = @("all")
} | ConvertTo-Json

$notifHeaders = @{
    Authorization = "Bearer $token"
}

$notifResponse = Invoke-RestMethod -Uri "$baseUrl/notifications/create" -Method Post -Body $notifBody -ContentType "application/json" -Headers $notifHeaders

Write-Host "Notification Creation Response:" -ForegroundColor Cyan
$notifResponse | ConvertTo-Json
