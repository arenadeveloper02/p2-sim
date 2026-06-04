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

const TEAM_MEMBERS: P2User[] = [
  {
    name: 'Rajiv Parikh',
    designation: 'CEO',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/RajivParikh.png',
  },
  {
    name: 'Vikrant',
    designation: 'Chief Technology Officer, Product',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/Vikrant.jpeg',
  },
  {
    name: 'Sajjan Kanukolanu',
    designation: 'VP, Global Operations',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/SajjanK.png',
  },
  {
    name: 'Sanjiv Parikh',
    designation: 'VP, Client Growth',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/SanjivParikh.png',
  },
  {
    name: 'Kumar G.',
    designation: 'Board Member, Founder, Vxtel & Virident',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/KumarG.jpeg',
  },
  {
    name: 'Shay Phillips',
    designation: 'Board Member, AT&T Exec',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/ShayPhillips.png',
  },
  {
    name: 'Mitsy Lopez Baranello',
    designation: 'Board Member, Huge (IPG Agency)',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/MitzyLopez.png',
  },
  {
    name: 'Jon Miller',
    designation: 'Board Member',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/JonMiller.jpeg',
  },
  {
    name: 'Jason',
    designation: 'Creative Director',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/Jason.png',
  },
  {
    name: 'Ahit',
    designation: 'Copy Director',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/Ahit.jpeg',
  },
  {
    name: 'Bharadwaj',
    designation: 'Creative Supervisor',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/Bharadwaj.jpeg',
  },
  {
    name: 'Kiran',
    designation: 'Senior VFX Producer',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/Kiran.jpeg',
  },
  {
    name: 'Niketh',
    designation: 'Graphic Designer',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/Niketh.jpeg',
  },
  {
    name: 'Rajesh',
    designation: 'Senior Director, Experience Design',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/Rajesh.jpeg',
  },
  {
    name: 'Vikram',
    designation: 'VP, Computing Systems Marketing',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/Vikram.jpeg',
  },
  {
    name: 'Brijesh',
    designation: 'Senior Director, Operations Excellence',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/Brijesh.jpeg',
  },
  {
    name: 'Sudheer',
    designation: 'Senior Director, PA',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/Sudheer.jpeg',
  },
  {
    name: 'Sangeetha',
    designation: 'Finance Controller, Finance',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/Sangeetha.jpeg',
  },
  {
    name: 'Bujji Babu',
    designation: 'Senior Director, Media & Affiliate Partnership',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/BujjiBabu.jpeg',
  },
  {
    name: 'Mohan A',
    designation: 'Senior Director, HR',
    url: 'https://arenav2image.s3.us-west-1.amazonaws.com/presentation-profile-images/MohanA.jpeg',
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
      ? TEAM_MEMBERS.filter(
          (m) =>
            m.name.toLowerCase().includes(keyword) ||
            m.designation.toLowerCase().includes(keyword)
        )
      : TEAM_MEMBERS

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
