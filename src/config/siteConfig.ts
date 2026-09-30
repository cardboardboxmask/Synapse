/**
 * Single editable configuration file for Synapse external community links,
 * solo-maker support links, and brand constants.
 */
export const SITE_CONFIG = {
  siteName: 'Synapse',
  tagline: 'Free, open idea network run by volunteers. No ads, no fees, ideas stay yours.',
  founderHandle: '@founder',
  founderName: 'Solo Maker & Curator',
  // Edit these URLs in one place to update Discord and Buy Me a Coffee links across the app:
  discordUrl: 'https://discord.gg/synapse-open-network',
  buyMeACoffeeUrl: 'https://buymeacoffee.com/synapse.maker',
  githubUrl: 'https://github.com/synapse-network/protocol',
  canonicalBaseUrl: 'https://synapse.network',
  // Hotlinked prototype and maker workbench images from the provided Stitch HTML:
  images: {
    localMeshBreadboard:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuANzNbqktRWbRXzt4WTfJr85AIm5l47TKhW-pDlQeXpDRmW0lMZzOJafHcQrEQq_qDTB38xLrc7A_IHIaJG9ZhnzcKP0ay59bXeRUZoTtUWenNnRkw3CkyUcQLKmdxIX9UYgG3d5eQXn-Ao_IMuudF5s4viNfG9cGp-wlE5oJeeQPepqtNjiQOaWwA8DaPbDcgQuGEotRUGJ8vlFunKbL2VXHg4niDMd0_jj9X0RxYTpy9VZ40R0_sP',
    localMeshEnclosure:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBHg9Xa6Z7U1wRAeo4-P5KUcsjR0TyFE5RQC1yHPjQ3T-GkxTcB_x3_lFRuKLJNshoKdciiBVUWJUIRcz4xEmA3bJAosIGTlmD5LVw25AHLkH52sl44A9MGSpd2ezsDcUl7gZWCCBanDcZuqgpQuUHvs_7gIaXrdfVOOloUGmJdmWmGr8w6stdzqzLaFMzKI9rfPCfHrJrGoCeQTxhJWM0ZhrkdfAq6pCpyMDOUzC56HBTEfzNBmlDF',
    makerWorkbench:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuA-Hl0FleHdM9efYBE9Fcb4ouqXDJmA1C1yK1dXQB8EBRusIKyhVJL8M08sOljXr2vVUrCcKW2kDreVlh8U-puzuWPGsIEhuwbd_cmgE53-ZxzD_EHQTQLr3cJY7vbkSE548jomyxmxCYr-wk5MY1an7HWAuZyDtGTzmaNqbSolKul0mWsya7vh3aQnq80Qh6388pKXe2IUheHN2dRu_kRVCdaMWsa9Woyk_enKpXCA22c8hlidk4Kn',
  },
} as const;
