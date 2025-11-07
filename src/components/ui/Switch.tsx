import React from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

const Switch: React.FC<SwitchProps> = ({ checked, onChange, label }) => {
  const toggle = () => onChange(!checked);

  return (
    <div className="flex items-center space-x-2 cursor-pointer" onClick={toggle} title={label}>
      <div className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out ${checked ? 'bg-sky-500' : 'bg-slate-600'}`}>
        <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </div>
    </div>
  );
};

export default Switch;
