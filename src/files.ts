import * as os from 'os';

export function showfileDir(subdir?: string)
{
    return os.homedir() + '/Spatial\ Intercom' + ((subdir) ? '/' + subdir : '');
}