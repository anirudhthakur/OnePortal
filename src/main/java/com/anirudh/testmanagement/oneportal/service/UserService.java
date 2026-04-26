package com.anirudh.testmanagement.oneportal.service;

import com.anirudh.testmanagement.oneportal.dto.UserDTO;
import com.anirudh.testmanagement.oneportal.entity.User;
import com.anirudh.testmanagement.oneportal.entity.User.Role;
import com.anirudh.testmanagement.oneportal.exception.ResourceNotFoundException;
import com.anirudh.testmanagement.oneportal.repository.ProjectMemberRepository;
import com.anirudh.testmanagement.oneportal.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final ProjectMemberRepository projectMemberRepository;

    public Page<UserDTO.Response> findAll(Pageable pageable) {
        return userRepository.findByEnabledAndDeletedFalse(true, pageable).map(this::toResponse);
    }

    public Page<UserDTO.Response> findPending(Pageable pageable) {
        return userRepository.findByEnabledAndDeletedFalse(false, pageable).map(this::toResponse);
    }

    public Page<UserDTO.Response> findInactive(Pageable pageable) {
        return userRepository.findByDeletedTrue(pageable).map(this::toResponse);
    }

    public UserDTO.Response findById(Long id) {
        return toResponse(getOrThrow(id));
    }

    @Transactional
    public UserDTO.Response create(UserDTO.CreateRequest request) {
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
                .role(request.getRole() != null ? request.getRole() : Role.TESTER)
                .build();
        return toResponse(userRepository.save(user));
    }

    @Transactional
    public UserDTO.Response update(Long id, UserDTO.UpdateRequest request) {
        User user = getOrThrow(id);
        if (request.getEmail() != null) {
            user.setEmail(request.getEmail());
        }
        if (request.getPassword() != null) {
            user.setPassword(passwordEncoder.encode(request.getPassword()));
        }
        if (request.getRole() != null) {
            user.setRole(request.getRole());
        }
        if (request.getEnabled() != null) {
            user.setEnabled(request.getEnabled());
        }
        return toResponse(userRepository.save(user));
    }

    @Transactional
    public void delete(Long id) {
        User user = getOrThrow(id);

        // Free the unique username/email slots so a new user with the same
        // credentials can be created again after this person leaves.
        String suffix = "_DEL" + id;
        String rawUsername = user.getUsername();
        String safePrefix = rawUsername.length() > (50 - suffix.length())
                ? rawUsername.substring(0, 50 - suffix.length())
                : rawUsername;
        user.setUsername(safePrefix + suffix);
        user.setEmail("deleted_" + id + "@oneportal.internal");

        // Remove from all project memberships so they disappear from project views.
        projectMemberRepository.deleteByUserId(id);

        user.setDeleted(true);
        user.setEnabled(false);
        userRepository.save(user);
    }

    @Transactional
    public UserDTO.Response approve(Long userId, Role role, Long requesterId) {
        User requester = getOrThrow(requesterId);
        if (requester.getRole() != Role.ADMIN) {
            throw new AccessDeniedException("Only ADMIN users can approve accounts");
        }
        User user = getOrThrow(userId);
        user.setEnabled(true);
        user.setRole(role);
        return toResponse(userRepository.save(user));
    }

    private User getOrThrow(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
    }

    private UserDTO.Response toResponse(User user) {
        return UserDTO.Response.builder()
                .id(user.getId())
                .username(user.getUsername())
                .email(user.getEmail())
                .role(user.getRole())
                .enabled(user.isEnabled())
                .deleted(user.isDeleted())
                .createdAt(user.getCreatedAt())
                .updatedAt(user.getUpdatedAt())
                .build();
    }
}
