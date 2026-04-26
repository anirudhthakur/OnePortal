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
}
