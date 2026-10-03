// Lead-owned. Judgement calls that change answers, in one place, so each can be switched and re-exported in a minute.
export const POLICY = {
  /**
   * When the unit count is empty, use the bounds the assessor use description states ("APT 7-30 UNITS", "(5+ units)", "6U")
   * to settle unit conditions. Off: an empty unit count makes every unit condition unknown, the literal reading of the
   * participant guide ("no unit count in this sample"). The explanation mentions the stated bounds either way.
   */
  unitBoundsFromUseDescription: false
};
