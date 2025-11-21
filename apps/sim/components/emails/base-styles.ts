// Base styles for all email templates

export const baseStyles = {
  fontFamily: 'HelveticaNeue, Helvetica, Arial, sans-serif',
  main: {
    backgroundColor: '#F3F8FE',
    padding: '20px 0',
    fontFamily: 'HelveticaNeue, Helvetica, Arial, sans-serif',
  },
  container: {
    maxWidth: '580px',
    margin: '30px auto',
    padding: ' 0 24px',
    backgroundColor: '#ffffff',
    borderRadius: '5px',
    overflow: 'hidden',
  },
  header: {
    padding: '30px 0',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  content: {
    padding: '5px 0 20px 0',
  },
  paragraph: {
    fontSize: '16px',
    lineHeight: '1.5',
    color: '#333333',
    margin: '16px 0',
  },
  button: {
    display: 'inline-block',
    backgroundColor: '#1A73E8',
    color: '#ffffff',
    fontWeight: 'semi-bold',
    fontSize: '16px',
    width: '183px',
    height: '40px',
    lineHeight: '40px',
    padding: '0 30px',
    borderRadius: '20px',
    // Visual elevation
    boxShadow: '0px 2px 4px 0px #6D717F29',
    // Hover/active variants (email clients may not support :hover; these values
    // are provided so templates or client-side rendering can reference them)
    backgroundColorHover: '#155cba',
    boxShadowHover: '0px 4px 8px 0px #6D717F29',
    transition: 'all 150ms ease',
    textDecoration: 'none',
    textAlign: 'center' as const,
    margin: '20px 0',
  },
  link: {
    color: '#802FFF',
    textDecoration: 'underline',
  },
  footer: {
    maxWidth: '580px',
    margin: '0 auto',
    padding: '20px 0',
    textAlign: 'center' as const,
  },
  footerText: {
    fontSize: '12px',
    color: '#666666',
    margin: '0',
  },
  codeContainer: {
    margin: '20px 0',
    padding: '16px',
    backgroundColor: '#f8f9fa',
    borderRadius: '5px',
    border: '1px solid #eee',
    textAlign: 'center' as const,
  },
  code: {
    fontSize: '28px',
    fontWeight: 'bold',
    letterSpacing: '4px',
    color: '#333333',
  },
  sectionsBorders: {
    width: '100%',
    display: 'flex',
  },
  sectionBorder: {
    borderBottom: '1px solid #E2E3E5',
    width: '249px',
  },
  sectionCenter: {
    borderBottom: '1px solid #802FFF',
    width: '102px',
  },
}
