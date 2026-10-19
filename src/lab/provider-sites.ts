export type ProviderSite = {
  id: string
  label: string
  providerFamily: string
  entryPath: string
  expectedPdfPaths: string[]
  expectedSourcePages: number
  method: 'html' | 'api' | 'browser'
  discoveryMethod: string
  limitations: string[]
}

const genericLimitation =
  'Synthetic route pattern for crawler testing; it does not claim compatibility with or fidelity to a vendor product.'

export const providerSites: readonly ProviderSite[] = [
  {
    id: 'wordpress-multisite',
    label: 'WordPress-style media library',
    providerFamily: 'WordPress multisite',
    entryPath: '/wp-network/wp-json/wp/v2/media?page=1',
    expectedPdfPaths: [
      '/wp-content/uploads/meeting.pdf',
      '/wp-content/uploads/sites/2/minutes.pdf',
    ],
    expectedSourcePages: 4,
    method: 'api',
    discoveryMethod: 'Paginated REST attachment records, with site-specific upload paths.',
    limitations: [
      genericLimitation,
      'No WordPress authentication, plugins, or multisite routing rules are modeled.',
    ],
  },
  {
    id: 'drupal-files',
    label: 'Drupal-style public files',
    providerFamily: 'Drupal',
    entryPath: '/drupal/',
    expectedPdfPaths: ['/drupal/sites/default/files/minutes.pdf'],
    expectedSourcePages: 3,
    method: 'html',
    discoveryMethod: 'HTML links under a conventional public files directory.',
    limitations: [
      genericLimitation,
      'Private file fields, Views, and Drupal access checks are not modeled.',
    ],
  },
  {
    id: 'granicus-govaccess',
    label: 'Government document portal',
    providerFamily: 'Granicus govAccess-like',
    entryPath: '/granicus/',
    expectedPdfPaths: ['/granicus/ShowDocument?id=100'],
    expectedSourcePages: 3,
    method: 'html',
    discoveryMethod: 'HTML link to an extensionless document endpoint with an ID query parameter.',
    limitations: [
      genericLimitation,
      'The document identifier and response are invented local fixtures.',
    ],
  },
  {
    id: 'opencities',
    label: 'Municipal files portal',
    providerFamily: 'OpenCities-like',
    entryPath: '/opencities/',
    expectedPdfPaths: ['/opencities/Agenda%20Packets/packet.pdf'],
    expectedSourcePages: 1,
    method: 'html',
    discoveryMethod: 'HTML link into a percent-encoded folder path.',
    limitations: [
      genericLimitation,
      'Only ordinary path encoding is represented; platform-specific APIs are not.',
    ],
  },
  {
    id: 'revize',
    label: 'Relative-path public site',
    providerFamily: 'Revize-like',
    entryPath: '/revize/departments/meetings',
    expectedPdfPaths: ['/revize/files/Minutes%20%26%20Agenda.pdf'],
    expectedSourcePages: 3,
    method: 'html',
    discoveryMethod: 'HTML base element and relative link with percent-encoded filename.',
    limitations: [genericLimitation, 'The base path and filename are synthetic.'],
  },
  {
    id: 'sharepoint-library',
    label: 'Document library',
    providerFamily: 'SharePoint-like',
    entryPath: '/sharepoint/',
    expectedPdfPaths: ['/sharepoint/sites/council/Shared%20Documents/2026/Agenda.pdf'],
    expectedSourcePages: 1,
    method: 'html',
    discoveryMethod:
      'Encoded library URL redirects to a download endpoint; separate login and expired-token responses model access boundaries.',
    limitations: [
      genericLimitation,
      'No Microsoft identity, cookies, Graph API, or real authorization flow is present.',
    ],
  },
  {
    id: 'joomla-download',
    label: 'CMS download component',
    providerFamily: 'Joomla-like',
    entryPath: '/joomla/',
    expectedPdfPaths: ['/joomla/index.php?option=com_docman&task=doc_download&gid=7'],
    expectedSourcePages: 1,
    method: 'html',
    discoveryMethod: 'Query-routed download component endpoint.',
    limitations: [genericLimitation, 'Only one synthetic component query shape is included.'],
  },
  {
    id: 'custom-static-migration',
    label: 'Custom, static, and migrated pages',
    providerFamily: 'Custom PHP/static or site-builder',
    entryPath: '/site-builder',
    expectedPdfPaths: ['/simple-1p.pdf', '/multi-page-3p.pdf'],
    expectedSourcePages: 4,
    method: 'browser',
    discoveryMethod:
      'Client-side fetch pagination via button load-more-records plus an old URL that redirects after migration.',
    limitations: [
      genericLimitation,
      'This profile combines generic static/client-rendered and migration patterns; it does not model decentralized office permissions.',
    ],
  },
] as const

export const PROVIDER_SITE_PROFILES = providerSites

export type ProviderResponse = {
  status: number
  body: string | Uint8Array
  contentType: string
  headers?: Record<string, string>
}

function html(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`
}

export function resolveProviderRoute(
  pathname: string,
  search: URLSearchParams,
  simplePdf: Uint8Array,
  multiPdf: Uint8Array,
): ProviderResponse | null {
  try {
    pathname = decodeURIComponent(pathname)
  } catch {
    /* retain malformed route for a safe no-match */
  }
  if (pathname === '/wp-network/wp-json/wp/v2/media') {
    const page = Number(search.get('page') ?? 1)
    const items =
      page === 1
        ? [{ id: 101, source_url: '/wp-content/uploads/meeting.pdf', mime_type: 'application/pdf' }]
        : page === 2
          ? [
              {
                id: 202,
                source_url: '/wp-content/uploads/sites/2/minutes.pdf',
                mime_type: 'application/pdf',
              },
            ]
          : []
    return {
      status: 200,
      body: JSON.stringify(items),
      contentType: 'application/json',
      headers: { 'x-wp-totalpages': '2' },
    }
  }
  if (pathname === '/wp-content/uploads/meeting.pdf') return pdf(simplePdf)
  if (pathname === '/wp-content/uploads/sites/2/minutes.pdf') return pdf(multiPdf)
  if (pathname === '/drupal/')
    return page(
      'Public files',
      '<a href="/drupal/sites/default/files/minutes.pdf">Meeting minutes</a>',
    )
  if (pathname === '/drupal/sites/default/files/minutes.pdf') return pdf(multiPdf)
  if (pathname === '/granicus/')
    return page('Council documents', '<a href="/granicus/ShowDocument?id=100">Agenda packet</a>')
  if (pathname === '/granicus/ShowDocument' && search.get('id') === '100') return pdf(multiPdf)
  if (pathname === '/opencities/')
    return page('Agenda packets', '<a href="/opencities/Agenda%20Packets/packet.pdf">Packet</a>')
  if (pathname === '/opencities/Agenda Packets/packet.pdf') return pdf(simplePdf)
  if (pathname === '/revize/departments/meetings')
    return page(
      'Meeting records',
      '<base href="/revize/"><a href="files/Minutes%20%26%20Agenda.pdf">Minutes and agenda</a>',
    )
  if (pathname === '/revize/files/Minutes & Agenda.pdf') return pdf(multiPdf)
  if (pathname === '/sharepoint/')
    return page(
      'Document library',
      '<a href="/sharepoint/sites/council/Shared%20Documents/2026/Agenda.pdf">Agenda</a><a href="/sharepoint/login">Sign in</a>',
    )
  if (pathname === '/sharepoint/sites/council/Shared Documents/2026/Agenda.pdf')
    return {
      status: 302,
      body: '',
      contentType: 'text/plain',
      headers: { location: '/sharepoint/download?fileId=agenda-2026' },
    }
  if (pathname === '/sharepoint/download' && search.get('fileId') === 'agenda-2026')
    return pdf(simplePdf)
  if (pathname === '/sharepoint/login')
    return { status: 401, body: 'Authentication required', contentType: 'text/plain' }
  if (pathname === '/sharepoint/token-expired')
    return { status: 403, body: 'Access token expired', contentType: 'text/plain' }
  if (pathname === '/joomla/')
    return page(
      'Downloads',
      '<a href="/joomla/index.php?option=com_docman&amp;task=doc_download&amp;gid=7">Download meeting packet</a>',
    )
  if (
    pathname === '/joomla/index.php' &&
    search.get('option') === 'com_docman' &&
    search.get('task') === 'doc_download' &&
    search.get('gid') === '7'
  )
    return pdf(simplePdf)
  if (pathname === '/site-builder')
    return page(
      'Public meetings',
      '<button id="load-more-records" type="button">Load more</button><ul id="records"></ul><script>let pageNumber=1;const button=document.querySelector("#load-more-records");async function loadRecords(){const r=await fetch(`/api/records?page=${pageNumber}`);const d=await r.json();document.querySelector("#records").insertAdjacentHTML("beforeend",d.items.map(i=>`<li><a href="${i.href}">${i.title}</a></li>`).join(""));pageNumber++;button.disabled=!d.hasMore;}loadRecords();button.addEventListener("click",loadRecords);</script>',
    )
  if (pathname === '/api/records') {
    const pageNumber = Number(search.get('page') ?? 1)
    const items =
      pageNumber === 1
        ? [{ title: 'Agenda', href: '/simple-1p.pdf' }]
        : pageNumber === 2
          ? [{ title: 'Minutes', href: '/multi-page-3p.pdf' }]
          : []
    return {
      status: 200,
      body: JSON.stringify({ items, page: pageNumber, hasMore: pageNumber === 1 }),
      contentType: 'application/json',
    }
  }
  if (pathname === '/legacy/board.php')
    return page(
      'Board records',
      '<a href="/legacy/old-minutes.php">Archived minutes</a><a href="/multi-page-3p.pdf">Current minutes</a>',
    )
  if (pathname === '/legacy/old-minutes.php')
    return {
      status: 301,
      body: '',
      contentType: 'text/plain',
      headers: { location: '/multi-page-3p.pdf' },
    }
  return null

  function page(title: string, body: string): ProviderResponse {
    return { status: 200, body: html(title, body), contentType: 'text/html; charset=utf-8' }
  }
  function pdf(body: Uint8Array): ProviderResponse {
    return { status: 200, body, contentType: 'application/pdf' }
  }
}
