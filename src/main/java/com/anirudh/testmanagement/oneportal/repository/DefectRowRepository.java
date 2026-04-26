package com.anirudh.testmanagement.oneportal.repository;

import com.anirudh.testmanagement.oneportal.entity.DefectRow;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface DefectRowRepository extends JpaRepository<DefectRow, Long> {

    List<DefectRow> findBySheetIdOrderByRowIndex(Long sheetId);

    Page<DefectRow> findBySheetIdOrderByRowIndex(Long sheetId, Pageable pageable);

    @Modifying(clearAutomatically = true)
    @Query("DELETE FROM DefectRow r WHERE r.sheet.id = :sheetId")
    void deleteBySheetId(@Param("sheetId") Long sheetId);

    @Modifying(clearAutomatically = true)
    @Query(nativeQuery = true,
        value = "DELETE FROM test_design_row_linked_defects " +
                "WHERE defect_row_id IN (SELECT id FROM defect_rows WHERE sheet_id = :sheetId)")
    void deleteLinkedDefectsByDefectSheetId(@Param("sheetId") Long sheetId);

    @Modifying(clearAutomatically = true)
    @Query(nativeQuery = true,
        value = "DELETE FROM test_design_row_linked_defects WHERE defect_row_id = :rowId")
    void deleteLinkedDefectsByRowId(@Param("rowId") Long rowId);

    long countBySheetId(Long sheetId);

    @Query("SELECT r FROM DefectRow r WHERE r.sheet.project.id = :projectId")
    List<DefectRow> findAllByProjectId(@Param("projectId") Long projectId);
}
