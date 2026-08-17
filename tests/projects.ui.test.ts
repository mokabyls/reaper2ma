import { beforeEach, describe, expect, it } from "vitest";
import {
    IndexedDbProjectRepository,
    canStoreBytes,
    createProjectDocument,
    getStorageUsage,
    nextProjectVersionName,
    parseProjectExport,
    serializeProjectExport,
} from "../src/lib/projects/index.js";

async function emptyProjectDatabase() {
    const repository = new IndexedDbProjectRepository();
    for (const project of await repository.listProjects()) await repository.deleteProject(project.id);
}

describe("IndexedDB project repository", () => {
    beforeEach(async () => {
        await emptyProjectDatabase();
    });

    it("creates, updates, reads and deletes projects", async () => {
        const repository = new IndexedDbProjectRepository();
        const project = createProjectDocument("Odyssees");
        await repository.saveProject(project);

        expect(await repository.getProject(project.id)).toEqual(project);
        expect(await repository.listProjects()).toHaveLength(1);

        const updated = { ...project, timecodeName: "Odyssees TC", updatedAt: new Date(Date.now() + 1000).toISOString() };
        await repository.saveProject(updated);
        expect((await repository.getProject(project.id))?.timecodeName).toBe("Odyssees TC");

        await repository.deleteProject(project.id);
        expect(await repository.getProject(project.id)).toBeUndefined();
    });

    it("stores the CSV and SHA-256 fingerprint, then duplicates it with an independent identity", async () => {
        const repository = new IndexedDbProjectRepository();
        const project = createProjectDocument("Show V2");
        await repository.saveProject(project);
        const attached = await repository.attachSource(project, "markers.csv", "#,Name,Start,Color\n1,Intro,0,");
        const duplicated = await repository.duplicateProject(project.id, nextProjectVersionName(project.projectName));

        expect(attached.source.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(duplicated.projectName).toBe("Show V3");
        expect(duplicated.timecodeName).toBe("Show V2");
        expect(duplicated.id).not.toBe(project.id);
        expect(duplicated.sourceId).not.toBe(attached.source.id);
        expect((await repository.getSource(duplicated.sourceId!))?.csvText).toBe(attached.source.csvText);
    });

    it("keeps only ten checkpoints and preserves the current state before a restore", async () => {
        const repository = new IndexedDbProjectRepository();
        let project = createProjectDocument("Revision 0");
        await repository.saveProject(project);

        for (let index = 1; index <= 12; index += 1) {
            project = { ...project, projectName: `Revision ${index}`, updatedAt: new Date().toISOString() };
            await repository.saveProject(project);
            await repository.createCheckpoint(project, "stage");
            await new Promise((resolve) => setTimeout(resolve, 2));
        }

        const revisions = await repository.listRevisions(project.id);
        expect(revisions).toHaveLength(10);
        const target = revisions[5]!;
        const restored = await repository.restoreRevision(project.id, target.id);
        expect(restored.projectName).toBe(target.snapshot.projectName);
        expect(await repository.listRevisions(project.id)).toHaveLength(10);
    });

    it("exports validated history and supports replace or copy on identifier collision", async () => {
        const repository = new IndexedDbProjectRepository();
        const project = createProjectDocument("Export me");
        await repository.saveProject(project);
        const attached = await repository.attachSource(project, "show.csv", "#,Name,Start,Color\n1,Intro,0,");
        await repository.createCheckpoint(attached.project, "stage");

        const serialized = serializeProjectExport(await repository.exportProject(project.id));
        const parsed = parseProjectExport(serialized);
        expect(parsed.project.id).toBe(project.id);
        expect(parsed.sources).toHaveLength(1);
        expect(parsed.revisions).toHaveLength(1);

        const copy = await repository.importProject(parsed, "copy");
        expect(copy.id).not.toBe(project.id);
        expect(copy.projectName).toBe("Export me (import)");
        expect((await repository.getSource(copy.sourceId!))?.projectId).toBe(copy.id);

        const replacement = await repository.importProject(parsed, "replace");
        expect(replacement.id).toBe(project.id);
        expect((await repository.getProject(project.id))?.projectName).toBe("Export me");

        const legacyBundle = JSON.parse(serialized) as { project: { settings: { executorLayout?: string } }; revisions: Array<{ snapshot: { settings: { executorLayout?: string } } }> };
        delete legacyBundle.project.settings.executorLayout;
        for (const revision of legacyBundle.revisions) delete revision.snapshot.settings.executorLayout;
        expect(parseProjectExport(JSON.stringify(legacyBundle)).project.settings.executorLayout).toBeUndefined();
    });

    it("rejects malformed project exports", () => {
        expect(() => parseProjectExport('{"kind":"reaper2ma-project","schemaVersion":1}')).toThrow(/not a supported/i);
    });
});

describe("storage quota policy", () => {
    it("warns at 80% and preemptively blocks imports that would reach 95%", async () => {
        const original = Object.getOwnPropertyDescriptor(navigator, "storage");
        Object.defineProperty(navigator, "storage", {
            configurable: true,
            value: { estimate: async () => ({ usage: 80, quota: 100 }) },
        });

        expect(await getStorageUsage()).toMatchObject({ ratio: 0.8, warning: true, critical: false });
        expect(await canStoreBytes(14)).toBe(true);
        expect(await canStoreBytes(15)).toBe(false);

        if (original) Object.defineProperty(navigator, "storage", original);
        else Reflect.deleteProperty(navigator, "storage");
    });
});

describe("project version names", () => {
    it("increments V2/V3 suffixes without changing the timecode implicitly", () => {
        expect(nextProjectVersionName("Traversée")).toBe("Traversée V2");
        expect(nextProjectVersionName("Traversée V2")).toBe("Traversée V3");
    });
});
