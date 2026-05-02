package com.anirudh.testmanagement.oneportal.repository;

import com.anirudh.testmanagement.oneportal.entity.TestDesignRow;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TestDesignRowRepository extends JpaRepository<TestDesignRow, Long> {

    List<TestDesignRow> findBySheetIdOrderByRowIndex(Long sheetId);

    @Modifying
    @Query(nativeQuery = true,
        value = "DELETE FROM test_design_row_linked_defects WHERE row_id IN " +
                "(SELECT id FROM test_design_rows WHERE sheet_id = :sheetId)")
    void deleteLinkedDefectsBySheetId(@Param("sheetId") Long sheetId);

    @Modifying
    @Query("DELETE FROM TestDesignRow r WHERE r.sheet.id = :sheetId")
    void deleteBySheetId(@Param("sheetId") Long sheetId);

    /**
     * Returns [defectRowId, linkedTestCount] pairs for all defects
     * that have at least one test-design row linked to them.
     * Used to compute "Impacted Scenarios" in the report.
     */
    @Query(nativeQuery = true,
        value = "SELECT defect_row_id, COUNT(row_id) " +
                "FROM test_design_row_linked_defects " +
                "GROUP BY defect_row_id")
    List<Object[]> countLinkedTestsByDefectId();

    /**
     * Returns all test design rows linked to a given defect row that are currently
     * FAILED or BLOCKED. Used to auto-transition them to IN_PROGRESS when the
     * linked defect is closed.
     */
    @Query(nativeQuery = true,
        value = "SELECT r.* FROM test_design_rows r " +
                "JOIN test_design_row_linked_defects l ON l.row_id = r.id " +
                "WHERE l.defect_row_id = :defectRowId " +
                "AND r.row_status IN ('FAILED', 'BLOCKED')")
    List<TestDesignRow> findFailedOrBlockedByLinkedDefectId(@Param("defectRowId") Long defectRowId);
}
