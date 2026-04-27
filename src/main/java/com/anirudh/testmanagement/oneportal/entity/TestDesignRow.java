package com.anirudh.testmanagement.oneportal.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "test_design_rows")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TestDesignRow {

    public enum RowStatus {
        NOT_STARTED, IN_PROGRESS, PASSED, FAILED, BLOCKED, NOT_APPLICABLE, NOT_DELIVERED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sheet_id", nullable = false)
    private TestDesignSheet sheet;

    @Column(nullable = false)
    private Integer rowIndex;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String rowData;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_to_id")
    private User assignedTo;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private RowStatus rowStatus;

    @ElementCollection
    @CollectionTable(
        name = "test_design_row_linked_defects",
        joinColumns = @JoinColumn(name = "row_id")
    )
    @Column(name = "defect_row_id")
    @Builder.Default
    private Set<Long> linkedDefectIds = new HashSet<>();

    @Column
    private LocalDateTime updatedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "updated_by_id")
    private User updatedBy;
}
