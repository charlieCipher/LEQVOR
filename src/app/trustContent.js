import { legalPages } from './legalContent';
export const pages = {
  "/trust": [
    "Trust Center",
    "Our commitments and current limitations",
    [
      [
        "What the service can see",
        "Opaque identifiers, timestamps, encrypted objects, and the account information required to authenticate you. Earlier V4 records can include plaintext titles until migrated.",
      ],
      [
        "What stays private",
        "V5 titles, instructions, relationships, filenames, and file contents are encrypted locally. Vault contents are not analyzed by AI.",
      ],
      [
        "Audit status",
        "This implementation has not received an independent security audit or penetration test. Do not treat it as production-ready.",
      ],
      [
        "If the service closes",
        "Encrypted recovery packages contain vault-wrapping metadata, records, and file objects. Independent recovery tooling and full restore validation remain release requirements.",
      ],
    ],
  ],
  "/security": [
    "Security",
    "How the V5 foundation protects information",
    [
      [
        "Encryption",
        "A random 256-bit vault master key wraps separate record and file keys. AES-GCM binds ciphertext to its object and purpose. Password and recovery mechanisms wrap the master key.",
      ],
      [
        "Recovery",
        "A client-generated 24-word secret recovers the master key. Account password recovery does not decrypt the vault.",
      ],
      [
        "Browser limitations",
        "Concealment is not screenshot prevention. Malware, malicious browser extensions, recipients copying information, and loss of all recovery secrets remain risks.",
      ],
    ],
  ],
  ...legalPages,
  "/status": [
    "Service status",
    "Development status",
    [
      [
        "Production status",
        "Not launched. Live service health monitoring is not connected.",
      ],
      [
        "Restore status",
        "Automated remote backup restore exercises have not been completed.",
      ],
    ],
  ],
  "/security-updates": [
    "Security updates",
    "Implementation history",
    [
      [
        "V5 foundation",
        "Versioned master-key wrapping, metadata encryption, recovery verification, Cold Lock, and browser policy configuration added.",
      ],
      [
        "Release gates",
        "Database isolation, complete sharing and revocation, restored backups, and external review remain mandatory before launch.",
      ],
    ],
  ],
  "/responsible-disclosure": [
    "Responsible disclosure",
    "Reporting security concerns",
    [
      [
        "Before launch",
        "A monitored disclosure address, response policy, and safe-harbor terms must be established. A public reporting channel is not active yet.",
      ],
      [
        "Protect private information",
        "Do not include vault contents, account passwords, recovery secrets, or decrypted keys in a report.",
      ],
    ],
  ],
};
export const publicTrustPaths = Object.keys(pages);
