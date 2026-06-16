import type { ToolConfig } from '@/tools/types'

interface P2User {
  name: string
  designation: string
  url: string
}

interface GetP2UsersParams {
  filter?: string
}

interface GetP2UsersResponse {
  success: boolean
  output: {
    users: P2User[]
    total: number
  }
}

const BASE_URL = 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images'

export const P2_TEAM_MEMBERS: P2User[] = [
  {
    name: 'Rajiv Parikh',
    designation: 'CEO',
    url: `${BASE_URL}/Rajiv%20Parikh.jpg`,
  },
  {
    name: 'Vikrant',
    designation: 'Chief Technology Officer, Product',
    url: `${BASE_URL}/Vikrant.jpg`,
  },
  {
    name: 'Sajjan Kanukolanu',
    designation: 'VP, Global Operations',
    url: `${BASE_URL}/Sajjan%20Kanukolanu.jpg`,
  },
  {
    name: 'Sanjiv Parikh',
    designation: 'VP, Client Growth',
    url: `${BASE_URL}/Sanjiv%20Parikh.jpg`,
  },
  {
    name: 'Kumar G',
    designation: 'Board Member, Founder, Vxtel & Virident',
    url: `${BASE_URL}/Kumar%20G.jpg`,
  },
  {
    name: 'Shay Phillips',
    designation: 'Board Member, AT&T Exec',
    url: `${BASE_URL}/Shay%20Phillips.jpg`,
  },
  {
    name: 'Mitsy Lopez Baranello',
    designation: 'Board Member, Huge (IPG Agency)',
    url: `${BASE_URL}/Mitsy%20Lopez%20Baranello.jpg`,
  },
  {
    name: 'Jon Miller',
    designation: 'Board Member',
    url: `${BASE_URL}/Jon%20Miller.jpg`,
  },
  {
    name: 'Jason',
    designation: 'Creative Director',
    url: `${BASE_URL}/Jason.jpg`,
  },
  {
    name: 'Ahit',
    designation: 'Copy Director',
    url: `${BASE_URL}/Ahit.jpg`,
  },
  {
    name: 'Bharadwaj',
    designation: 'Creative Supervisor',
    url: `${BASE_URL}/Bharadwaj.jpg`,
  },
  {
    name: 'Kiran',
    designation: 'Senior VFX Producer',
    url: `${BASE_URL}/Kiran.jpg`,
  },
  {
    name: 'Niketh',
    designation: 'Graphic Designer',
    url: `${BASE_URL}/Niketh.jpg`,
  },
  {
    name: 'Rajesh M',
    designation: 'Senior Director, Experience Design',
    url: `${BASE_URL}/Rajesh%20M.jpg`,
  },
  {
    name: 'Seetha',
    designation: 'HR Administrator',
    url: `${BASE_URL}/Seetha.jpg`,
  },
  {
    name: 'Vikram',
    designation: 'VP, Computing Systems Marketing',
    url: `${BASE_URL}/Vikram.jpg`,
  },
  {
    name: 'Brijesh',
    designation: 'Senior Director, Operations Excellence',
    url: `${BASE_URL}/Brijesh.jpg`,
  },
  {
    name: 'Sudheer',
    designation: 'Senior Director, PA',
    url: `${BASE_URL}/Sudheer.jpg`,
  },
  {
    name: 'Sangeetha',
    designation: 'Finance Controller, Finance',
    url: `${BASE_URL}/Sangeetha.jpg`,
  },
  {
    name: 'Bujji Babu',
    designation: 'Senior Director, Media & Affiliate Partnership',
    url: `${BASE_URL}/Bujji%20Babu.jpg`,
  },
  {
    name: 'Mohan A',
    designation: 'Senior Director, HR',
    url: `${BASE_URL}/Mohan%20A.jpg`,
  },
]

export const getP2UsersTool: ToolConfig<GetP2UsersParams, GetP2UsersResponse> = {
  id: 'google_slides_get_p2_users',
  name: 'Get P2 Team Members',
  description:
    'Returns the list of Position2 (P2) team members — name, designation, and profile image URL — for use when populating team or speaker slides. Optionally filter by name or designation keyword.',
  version: '1.0.0',

  params: {
    filter: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Optional case-insensitive keyword to filter members by name or designation (e.g. "VP", "Board", "Rajiv").',
    },
  },

  request: {
    url: '/api/tools/google_slides/get_p2_users',
    method: 'GET',
    headers: () => ({}),
  },

  directExecution: async (params: GetP2UsersParams): Promise<GetP2UsersResponse> => {
    const keyword = params.filter?.trim().toLowerCase()

    const users = keyword
      ? P2_TEAM_MEMBERS.filter(
          (m) =>
            m.name.toLowerCase().includes(keyword) ||
            m.designation.toLowerCase().includes(keyword)
        )
      : P2_TEAM_MEMBERS

    return {
      success: true,
      output: {
        users,
        total: users.length,
      },
    }
  },

  outputs: {
    users: {
      type: 'array',
      description: 'List of matched P2 team members.',
      items: {
        type: 'json',
      },
    },
    total: {
      type: 'number',
      description: 'Total number of users returned.',
    },
  },
}
