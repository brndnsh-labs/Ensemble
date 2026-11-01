import { describe, expect, it } from 'vitest';
import { SECTION_ROLES, sectionRoleOf } from './plan.js';

/** #2021 — the names the stand offers are the band's own: each one reads back as itself. */
describe('section roles', () => {
    it('reads each offered name back as its own role', () => {
        for (const { name } of SECTION_ROLES) {
            expect(sectionRoleOf(name)).toBe(name);
            expect(sectionRoleOf(`${name} 2`)).toBe(name);
        }
    });

    it('reads aliases and gives a plain letter no role', () => {
        expect(sectionRoleOf('Hook')).toBe('Chorus');
        expect(sectionRoleOf(' coda ')).toBe('Outro');
        expect(sectionRoleOf('A')).toBeNull();
        expect(sectionRoleOf('Head')).toBeNull();
    });
});
