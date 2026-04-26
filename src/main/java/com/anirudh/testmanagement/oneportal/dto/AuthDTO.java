package com.anirudh.testmanagement.oneportal.dto;

import com.anirudh.testmanagement.oneportal.entity.User.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Builder;
import lombok.Value;

import java.time.LocalDateTime;

public class AuthDTO {

    @Value
    @Builder
    public static class SignupRequest {
        @NotBlank
        @Size(min = 3, max = 50)
        String username;

        @NotBlank
        @Email
        String email;

        @NotBlank
        @Size(min = 8, max = 100)
        String password;
    }

    @Value
    @Builder
    public static class LoginRequest {
        @NotBlank
        String username;

        @NotBlank
        String password;
    }

    @Value
    @Builder
    public static class VerifyPasswordRequest {
        Long userId;
        String password;
    }

    @Value
    @Builder
    public static class UserResponse {
        Long id;
        String username;
        String email;
        Role role;
        boolean enabled;
        LocalDateTime createdAt;
    }

    @Value
    @Builder
    public static class VerifyPasswordResponse {
        boolean valid;
    }
}
