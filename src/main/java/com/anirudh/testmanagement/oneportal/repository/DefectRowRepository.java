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

    /**
     * Returns (defect_id string, test_design row_id) pairs for all links belonging to a given
     * defect sheet. Used to snapshot links before a sheet replacement so they can be restored
     * against the new rows by matching on the human-readable defect_id.
     */
    @Query(nativeQuery = true,
        value = "SELECT d.defect_id, l.row_id FROM defect_rows d " +
                "JOIN test_design_row_linked_defects l ON l.defect_row_id = d.id " +
                "WHERE d.sheet_id = :sheetId")
    List<Object[]> findExistingLinksForSheet(@Param("sheetId") Long sheetId);

    @Modifying(clearAutomatically = true)
    @Query(nativeQuery = true,
        value = "INSERT INTO test_design_row_linked_defects (row_id, defect_row_id) " +
                "VALUES (:testRowId, :defectRowId) ON CONFLICT DO NOTHING")
    void insertLink(@Param("testRowId") Long testRowId, @Param("defectRowId") Long defectRowId);

    long countBySheetId(Long sheetId);

    @Query("SELECT r FROM DefectRow r WHERE r.sheet.project.id = :projectId")
    List<DefectRow> findAllByProjectId(@Param("projectId") Long projectId);
}
