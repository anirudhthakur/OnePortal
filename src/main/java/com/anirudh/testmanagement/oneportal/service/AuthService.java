package com.anirudh.testmanagement.oneportal.service;

import com.anirudh.testmanagement.oneportal.dto.AuthDTO;
import com.anirudh.testmanagement.oneportal.entity.User;
import com.anirudh.testmanagement.oneportal.entity.User.Role;
import com.anirudh.testmanagement.oneportal.exception.ResourceNotFoundException;
import com.anirudh.testmanagement.oneportal.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public AuthDTO.UserResponse signup(AuthDTO.SignupRequest request) {
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new IllegalArgumentException("Username already taken: " + request.getUsername());
        }
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("Email already registered: " + request.getEmail());
        }
        User user = User.builder()
                .username(request.getUsername())
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .role(Role.VIEWER)
                .enabled(false)
                .build();
        return toResponse(userRepository.save(user));
    }

    public AuthDTO.UserResponse login(AuthDTO.LoginRequest request) {
        User user = userRepository.findByUsername(request.getUsername())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid username or password"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid username or password");
        }
        if (!user.isEnabled()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Your account is pending admin approval");
        }
        return toResponse(user);
    }

    public AuthDTO.VerifyPasswordResponse verifyPassword(AuthDTO.VerifyPasswordRequest request) {
        User user = userRepository.findById(request.getUserId())
                .orElseThrow(() -> new ResourceNotFoundException("User", request.getUserId()));
        boolean valid = passwordEncoder.matches(request.getPassword(), user.getPassword())
                && user.isEnabled();
        return AuthDTO.VerifyPasswordResponse.builder().valid(valid).build();
    }

    private AuthDTO.UserResponse toResponse(User user) {
        return AuthDTO.UserResponse.builder()
                .id(user.getId())
                .username(user.getUsername())
                .email(user.getEmail())
                .role(user.getRole())
                .enabled(user.isEnabled())
                .createdAt(user.getCreatedAt())
                .build();
    }
}
