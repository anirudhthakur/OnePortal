package com.anirudh.testmanagement.oneportal.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "test_executions")
@EntityListeners(AuditingEntityListener.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TestExecution {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "test_case_id", nullable = false)
    private TestCase testCase;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "executed_by_id", nullable = false)
    private User executedBy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ExecutionStatus executionStatus = ExecutionStatus.PENDING;

    @Column(columnDefinition = "TEXT")
    private String actualResult;

    @Column(columnDefinition = "TEXT")
    private String comments;

    /** Optional: build or release version under test */
    @Column(length = 100)
    private String buildVersion;

    /** Optional: environment where the test was run */
    @Column(length = 50)
    private String environment;

    /** Wall-clock duration in milliseconds */
    private Long durationMs;

    private LocalDateTime startedAt;

    private LocalDateTime finishedAt;

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;

    public enum ExecutionStatus {
        PENDING, IN_PROGRESS, PASSED, FAILED, BLOCKED, SKIPPED
    }
}
