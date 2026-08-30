import { z } from "zod";

const assessment = z.object({ score: z.number().int().min(0).max(100), evidenceRefs: z.array(z.string().trim().min(1).max(200)).min(1).max(100), method: z.string().trim().min(1).max(1000) }).strict();
export const qualityEvidenceSchema = z.object({ source_quality: assessment, mapping_quality: assessment, formula_reliability: assessment }).strict();
export type QualityEvidence = z.infer<typeof qualityEvidenceSchema>;
