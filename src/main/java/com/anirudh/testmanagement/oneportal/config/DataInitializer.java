package com.anirudh.testmanagement.oneportal.config;

import com.anirudh.testmanagement.oneportal.entity.User;
import com.anirudh.testmanagement.oneportal.entity.User.Role;
import com.anirudh.testmanagement.oneportal.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        boolean adminExists = userRepository.existsByRoleAndEnabledTrue(Role.ADMIN);

        if (!adminExists) {
            User admin = User.builder()
                    .username("admin")
                    .email("admin@oneportal.dev")
                    .password(passwordEncoder.encode("Admin@1234"))
                    .role(Role.ADMIN)
                    .enabled(true)
                    .build();
            userRepository.save(admin);
            log.warn("====================================================");
            log.warn("  Default admin created: admin / Admin@1234");
            log.warn("  Change this password immediately after first login!");
            log.warn("====================================================");
        }
    }
}
