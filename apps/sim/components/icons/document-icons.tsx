import type React from 'react'

interface IconProps {
  className?: string
}

export const PdfIcon: React.FC<IconProps> = ({ className = 'w-6 h-6' }) => (
  <svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg' className={className}>
    <path
      d='M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z'
      fill='#E53935'
    />
    <path d='M14 2V8H20' fill='#EF5350' />
    <path
      d='M14 2L20 8V20C20 21.1 19.1 22 18 22H6C4.9 22 4 21.1 4 20V4C4 2.9 4.9 2 6 2H14Z'
      stroke='#C62828'
      strokeWidth='0.5'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
    <text
      x='12'
      y='16'
      textAnchor='middle'
      fontSize='7'
      fontWeight='bold'
      fill='white'
      fontFamily='Arial, sans-serif'
    >
      PDF
    </text>
  </svg>
)

export const DocxIcon: React.FC<IconProps> = ({ className = 'w-6 h-6' }) => (
  <svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg' className={className}>
    <path
      d='M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z'
      fill='#2196F3'
    />
    <path d='M14 2V8H20' fill='#64B5F6' />
    <path
      d='M14 2L20 8V20C20 21.1 19.1 22 18 22H6C4.9 22 4 21.1 4 20V4C4 2.9 4.9 2 6 2H14Z'
      stroke='#1565C0'
      strokeWidth='0.5'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
    <text
      x='12'
      y='16'
      textAnchor='middle'
      fontSize='8'
      fontWeight='bold'
      fill='white'
      fontFamily='Arial, sans-serif'
    >
      W
    </text>
  </svg>
)

export const XlsxIcon: React.FC<IconProps> = ({ className = 'w-6 h-6' }) => (
  <svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg' className={className}>
    <path
      d='M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z'
      fill='#4CAF50'
    />
    <path d='M14 2V8H20' fill='#81C784' />
    <path
      d='M14 2L20 8V20C20 21.1 19.1 22 18 22H6C4.9 22 4 21.1 4 20V4C4 2.9 4.9 2 6 2H14Z'
      stroke='#2E7D32'
      strokeWidth='0.5'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
    <text
      x='12'
      y='16'
      textAnchor='middle'
      fontSize='8'
      fontWeight='bold'
      fill='white'
      fontFamily='Arial, sans-serif'
    >
      X
    </text>
  </svg>
)

export const CsvIcon: React.FC<IconProps> = ({ className = 'w-6 h-6' }) => (
  <svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg' className={className}>
    <path
      d='M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z'
      fill='#4CAF50'
    />
    <path d='M14 2V8H20' fill='#81C784' />
    <path
      d='M14 2L20 8V20C20 21.1 19.1 22 18 22H6C4.9 22 4 21.1 4 20V4C4 2.9 4.9 2 6 2H14Z'
      stroke='#2E7D32'
      strokeWidth='0.5'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
    <g transform='translate(0, -1)'>
      <rect x='8' y='11' width='8' height='0.5' fill='white' />
      <rect x='8' y='13' width='8' height='0.5' fill='white' />
      <rect x='8' y='15' width='8' height='0.5' fill='white' />
      <rect x='11.75' y='11' width='0.5' height='6' fill='white' />
    </g>
  </svg>
)

export const TxtIcon: React.FC<IconProps> = ({ className = 'w-6 h-6' }) => (
  <svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg' className={className}>
    <path
      d='M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z'
      fill='#757575'
    />
    <path d='M14 2V8H20' fill='#9E9E9E' />
    <path
      d='M14 2L20 8V20C20 21.1 19.1 22 18 22H6C4.9 22 4 21.1 4 20V4C4 2.9 4.9 2 6 2H14Z'
      stroke='#424242'
      strokeWidth='0.5'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
    <text
      x='12'
      y='16'
      textAnchor='middle'
      fontSize='6'
      fontWeight='bold'
      fill='white'
      fontFamily='Arial, sans-serif'
    >
      TXT
    </text>
  </svg>
)

export const DefaultFileIcon: React.FC<IconProps> = ({ className = 'w-6 h-6' }) => (
  <svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg' className={className}>
    <path
      d='M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z'
      fill='#607D8B'
    />
    <path d='M14 2V8H20' fill='#90A4AE' />
    <path
      d='M14 2L20 8V20C20 21.1 19.1 22 18 22H6C4.9 22 4 21.1 4 20V4C4 2.9 4.9 2 6 2H14Z'
      stroke='#37474F'
      strokeWidth='0.5'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
    <rect x='8' y='13' width='8' height='1' fill='white' rx='0.5' />
    <rect x='8' y='15' width='8' height='1' fill='white' rx='0.5' />
    <rect x='8' y='17' width='5' height='1' fill='white' rx='0.5' />
  </svg>
)

// Helper function to get the appropriate icon component
export function getDocumentIcon(mimeType: string, filename: string): React.FC<IconProps> {
  const extension = filename.split('.').pop()?.toLowerCase()

  if (mimeType === 'application/pdf' || extension === 'pdf') {
    return PdfIcon
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    extension === 'docx' ||
    extension === 'doc'
  ) {
    return DocxIcon
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    extension === 'xlsx' ||
    extension === 'xls'
  ) {
    return XlsxIcon
  }
  if (mimeType === 'text/csv' || extension === 'csv') {
    return CsvIcon
  }
  if (mimeType === 'text/plain' || extension === 'txt') {
    return TxtIcon
  }
  return DefaultFileIcon
}

/**
 * Renders the Spyfu icon as an SVG component.
 * @param props - The icon props for customizing the className and styling.
 * @returns The Spyfu icon as a React functional component.
 */
export const SpyfuIcon: React.FC<IconProps> = (props) => (
  <svg
    {...props}
    width='32'
    height='32'
    viewBox='0 0 32 32'
    xmlns='http://www.w3.org/2000/svg'
    fill='none'
  >
    <rect width='32' height='32' rx='8' fill='#14213D' />
    <path
      d='M8 20C8 14.477 12.477 10 18 10C22.418 10 26 13.582 26 18C26 22.418 22.418 26 18 26'
      stroke='#FCA311'
      strokeWidth='2'
      strokeLinecap='round'
    />
    <path
      d='M8 20C8 22.2091 9.79086 24 12 24H18'
      stroke='#E5E5E5'
      strokeWidth='2'
      strokeLinecap='round'
    />
    <circle cx='12' cy='24' r='2' fill='#E5E5E5' />
    <circle cx='18' cy='26' r='2' fill='#FCA311' />
  </svg>
)
