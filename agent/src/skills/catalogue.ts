import { InlineReviewerSkill } from "./built-in/inline-reviewer.js";
import { IntentAnalysisSkill } from "./built-in/intent-analysis.js";
import { ReviewSynthesisSkill } from "./built-in/review-synthesis.js";
import { Skill } from "./types.js";


export const CATALOGUE: readonly Skill[] = [
    new IntentAnalysisSkill(),
    new InlineReviewerSkill(),
    new ReviewSynthesisSkill(),
]