# Build the challenge benchmark in 20 minutes
The two included cases are smoke examples. They are not evidence of domain accuracy.

Create 24 cases: 8 typical real workflows, 4 ambiguous inputs, 4 missing data, 4 contradictory/adversarial inputs, 4 API/tool failures. Record expected facts/actions and what must never be asserted. Keep 8 cases held out before changing prompts; use the other 16 to debug. Add real source documents/citations and labels from the challenge, not arbitrary synthetic paraphrases.

The included harness compares the same schema, providers, input, and output-token cap with a simple baseline prompt versus the stronger prompt. Its lexical checks are deliberately limited: inspect failures for synonyms/negations before using a score. Add challenge-specific deterministic assertions (amounts, citations, valid action permissions) to the grader. Then add a blinded semantic judge if needed, with a different model family and five human-calibrated examples. Swap output order. A schema-valid answer is not a correct answer.

Run npm run eval only after npm run live-check passes. It spends API money and refuses to score replay mode. Repeat each real case twice for stochastic workflows, log attempts/failures, report sample size and medians/p95. Compare runs with the same actual provider/model; a fallback response cannot establish an intrinsic model advantage. Save measured reports separately from prepared examples.
