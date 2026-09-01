import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { logger } from "./logger";

describe("logger", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("logs debug messages in development", () => {
        const spy = vi.spyOn(console, "debug").mockImplementation(() => { });

        logger.debug("Test debug message");

        if (import.meta.env.DEV) {
            expect(spy).toHaveBeenCalledWith(
                "[DEBUG] Test debug message",
                ""
            );
        }
    });

    it("logs info messages in development", () => {
        const spy = vi.spyOn(console, "info").mockImplementation(() => { });

        logger.info("Test info message");

        if (import.meta.env.DEV) {
            expect(spy).toHaveBeenCalledWith(
                "[INFO] Test info message",
                ""
            );
        }
    });

    it("logs warnings in development", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => { });

        logger.warn("Test warning");

        if (import.meta.env.DEV) {
            expect(spy).toHaveBeenCalledWith(
                "[WARN] Test warning",
                ""
            );
        }
    });

    it("always logs errors", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => { });

        const error = new Error("Test error");

        logger.error("Something failed", error);

        expect(spy).toHaveBeenCalledWith(
            "[ERROR] Something failed",
            error
        );
    });

    it("supports structured debug data", () => {
        const spy = vi.spyOn(console, "debug").mockImplementation(() => { });

        const data = {
            fileCount: 3,
            hasCode: true,
        };

        logger.debug("Transfer loaded", data);

        if (import.meta.env.DEV) {
            expect(spy).toHaveBeenCalledWith(
                "[DEBUG] Transfer loaded",
                data
            );
        }
    });
});