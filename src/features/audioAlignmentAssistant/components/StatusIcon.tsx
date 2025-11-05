import React from 'react';
import { CheckCircleIcon, XMarkIcon } from '../../../components/ui/icons';

interface StatusIconProps {
    status?: boolean;
}

export const StatusIcon: React.FC<StatusIconProps> = ({ status }) => (
    status === true ? <CheckCircleIcon className="w-5 h-5 text-green-500" /> :
    status === false ? <XMarkIcon className="w-5 h-5 text-red-500" /> :
    <span className="w-5 h-5 text-slate-600 flex items-center justify-center">-</span>
);
