# Insurance continuity scope

Insurance remains a record type within the vault and continuity graph. The hub is available at `/app/vault/insurance`, through the Insurance category. Policies are created with the existing five-step encrypted record flow.

- Separate owner, insured, beneficiary and trusted-contact IDs. A role never creates a grant, invitation, verification, or legal entitlement.
- Links to other asset records; reverse policy links in asset records and person details.
- Provider, policy reference, advisor/contact, renewal date, claim instructions and continuity instructions use the existing encrypted payload. Supporting files use the existing per-document encryption flow.
- An encrypted metadata index contains role/asset IDs, owner-recorded policy status, renewal-presence and administrative-completeness flags. It contains no policy numbers, dates or instruction text. Metadata and links are only available inside an unlocked vault session and clear with that session.
- Claim Readiness counts nine factual information items. It does not assess claim validity, legal eligibility, coverage quality, or adequacy. Missing people are not counted as valid completed role links.
- Coverage Map uses `Policy linked`, `No active policy linked`, `Renewal information missing`, and `Beneficiary not recorded`. Status is user recorded, not insurer verified.
- Continuity displays the policy checklist and missing beneficiary information. Policy details stay deliberately hidden until revealed in the workspace.

No insurer integrations, payments, claim submission, insurance recommendations, underwriting, policy comparison, optimization, or underinsurance scoring are implemented. Dates are recorded information; automated renewal notifications are not connected.

Existing records without the index show missing information until reviewed and saved. Relationship references are validated against the currently available record/person lists when editing. References to subsequently removed people/assets show as unavailable rather than granting access. This is a local encrypted graph; authenticated, server-mediated sharing remains a separate unfinished V5 capability.

Validation: unit coverage for separate roles, reverse links, expired/missing index states, invalid dates, unavailable people, foreign references and private-value exclusion; component workflows for policy creation and hub navigation. Production auth/storage/RLS validation remains pending as described in V5-IMPLEMENTATION.md.

Visual changes follow the owner's repeated request to reproduce the six supplied screens: scenic sidebar, brighter purple controls, compact page compositions, illustrated archive and portrait trust map. The portrait asset `public/leqvor-portraits.png` was generated with the built-in image tool from a prompt requesting eight fictional Indian family/professional headshots in an evenly spaced 4×2 contact sheet, muted studio backgrounds and no text.
