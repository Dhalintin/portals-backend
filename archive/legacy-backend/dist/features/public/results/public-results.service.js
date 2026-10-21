"use strict";
// import { PinStatus, Prisma } from "@prisma/client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicResultsService = void 0;
function formatTermName(name) {
    const map = {
        FIRST: "First Term",
        SECOND: "Second Term",
        THIRD: "Third Term",
    };
    return map[name] ?? name;
}
class PublicResultsService {
    /**
     * Verify admission + serial + PIN and return published result
     * for the term the pin is tied to.
     */
    async verify(input, meta) { }
}
exports.PublicResultsService = PublicResultsService;
