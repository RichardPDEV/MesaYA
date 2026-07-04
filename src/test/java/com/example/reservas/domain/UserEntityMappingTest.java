package com.example.reservas.domain;

import org.junit.jupiter.api.Test;

import jakarta.persistence.Table;

import static org.junit.jupiter.api.Assertions.assertEquals;

class UserEntityMappingTest {

    @Test
    void userEntityUsesQuotedTableNameForPostgresCompatibility() {
        Table table = User.class.getAnnotation(Table.class);
        assertEquals("\"user\"", table.name());
    }
}
