import React from 'react';

interface AuthPanelLayoutProps {
  children: React.ReactNode;
}

/**
 * Shared layout component for all authentication screens
 * Features a two-panel design:
 * - Left panel: Branding with logo and circular image collage
 * - Right panel: Form content (passed as children)
 */
const AuthPanelLayout: React.FC<AuthPanelLayoutProps> = ({ children }) => {
  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'var(--Linear-Gradient-for-Login, linear-gradient(180deg, rgba(0, 122, 255, 0.40) 0%, rgba(242, 118, 27, 0.40) 100%))',
        backgroundSize: 'cover'
      }}
    >
      <div className="w-full max-w-[975px] h-[650px] bg-white rounded-2xl overflow-hidden shadow-lg flex gap-2.5 p-2.5">
        {/* Left Panel - Branding */}
        <div className="flex-1 bg-gradient-to-br from-sky-200 to-sky-300 rounded-2xl relative overflow-hidden">
          {/* Logo and Organization Name */}
          <div className="absolute left-1/2 -translate-x-1/2 top-7 flex items-center gap-6 z-10">
            <div className="w-[60px] h-[60px] relative">
              <img
                src="/assets/a8ebdf5975d6d9ab7f5064a60b7a388fe436a8bb.png"
                alt="Mathura Vrindavan Development Authority Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="text-[28px] font-normal leading-normal text-transparent bg-clip-text bg-gradient-to-r from-[#f2761b] to-black drop-shadow-md whitespace-pre">
              <p className="mb-0">Mathura Vrindavan </p>
              <p>Development Authority</p>
            </div>
          </div>

          {/* Circular Image Collage */}
          <div className="absolute left-[48.88px] top-[150px] w-[375px] h-[376.248px]">
            {/* Top right image - Ellipse 1167 */}
            <div className="absolute left-[216.83px] top-[5.13px] w-[153.22px] h-[194.76px]">
              <img
                src="/assets/4e5638f48cc36e54dcf90d90636cb9e3eeb1a734.png"
                alt=""
                className="block max-w-none w-full h-full"
                style={{ width: '153.22px', height: '194.76px' }}
              />
            </div>
            {/* Top left image - Vector 28 */}
            <div className="absolute left-[26.21px] top-0 w-[213.064px] h-[134.913px]">
              <img
                src="/assets/b8e7e92c30a0039b583930d7875865552bd1aba8.png"
                alt=""
                className="block max-w-none w-full h-full"
                style={{ width: '213.064px', height: '134.913px' }}
              />
            </div>
            {/* Bottom left image - Vector 29 (optimized version) */}
            <div 
              className="absolute flex items-center justify-center left-[-41.8px] top-[79.07px]" 
              style={{ 
                height: '0px', 
                width: '0px' 
              }}
            > 
              <div className="flex-none" style={{ transform: 'rotate(-71.125deg)' }}> 
                <div 
                  className="relative w-[213.064px] h-[134.913px]" 
                  style={{ 
                    top: '8.29rem', 
                    left: '-5.398rem' 
                  }}
                > 
                  <img 
                    alt="" 
                    className="block max-w-none w-full h-full" 
                    src="/assets/3df9bb910847f92ec63648a7f818c7d8eb2dfd64.png" 
                    style={{ 
                      width: '213.064px', 
                      height: '134.913px' 
                    }} 
                  /> 
                </div> 
              </div> 
            </div>
            {/* Bottom center image - Vector 30 (optimized with precise implementation) */}
            <div
              className="absolute flex items-center justify-center left-[35.07px] top-[198.82px]"
              style={{
                height: 'calc(0px)',
                width: 'calc(0px)'
              }}
            >
              <div className="flex-none" style={{ transform: 'rotate(-143.789deg)' /* rotate(216.211deg) */ }}>
                <div 
                  className="relative w-[213.064px] h-[136.066px]"
                  style={{
                    bottom: '1.3rem',
                    right: '10.88rem'
                  }}
                >
                  <img
                    src="/assets/ff2affc0e980f78fb25f86de9ab527d1d4b2fa98.png"
                    alt=""
                    className="block max-w-none w-full h-full"
                    style={{ width: '213.064px', height: '136.066px' }}
                  />
                </div>
              </div>
            </div>
            {/* Right image - Vector 31 (optimized with precise implementation) */}
            <div
              className="absolute flex items-center justify-center left-[174.91px] top-[136.41px]"
              style={{
                height: 'calc(0px)',
                width: 'calc(0px)'
              }}
            >
              <div className="flex-none" style={{ transform: 'rotate(142.535deg)' }}>
                <div 
                  className="relative w-[213.064px] h-[136.952px]"
                  style={{
                    bottom: '10.72rem',
                    right: '2.1rem'
                  }}
                >
                  <img
                    src="/assets/76696078b52786db2907040e743a1286eadf36a7.png"
                    alt=""
                    className="block max-w-none w-full h-full"
                    style={{ width: '213.064px', height: '136.952px' }}
                  />
                </div>
              </div>
            </div>
            {/* White center circle to create ring effect */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-br from-sky-200 to-sky-300 rounded-full"
              style={{ width: '140px', height: '140px' }}
            />
          </div>
        </div>

        {/* Right Panel - Form Content */}
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          <div className="w-[360px] h-full flex flex-col justify-center overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent px-2">
            <div className="flex flex-col gap-6 py-4">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPanelLayout;
