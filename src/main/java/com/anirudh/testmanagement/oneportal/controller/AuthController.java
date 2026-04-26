package com.anirudh.testmanagement.oneportal.controller;

import com.anirudh.testmanagement.oneportal.dto.AuthDTO;
import com.anirudh.testmanagement.oneportal.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Auth", description = "Signup, login, and password verification")
public class AuthController {

    private final AuthService authService;

    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Register a new account (starts as pending, requires admin approval)")
    public AuthDTO.UserResponse signup(@Valid @RequestBody AuthDTO.SignupRequest request) {
        return authService.signup(request);
    }

    @PostMapping("/login")
    @Operation(summary = "Log in with username and password")
    public AuthDTO.UserResponse login(@Valid @RequestBody AuthDTO.LoginRequest request) {
        return authService.login(request);
    }

    @PostMapping("/verify-password")
    @Operation(summary = "Verify a user's password (used for user-switching confirmation)")
    public AuthDTO.VerifyPasswordResponse verifyPassword(@RequestBody AuthDTO.VerifyPasswordRequest request) {
        return authService.verifyPassword(request);
    }
}
