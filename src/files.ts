import * as os from 'os';

export function configFileDir(subdir?: string)
{
    return os.homedir() + '/Spatial\ Intercom' + ((subdir) ? '/' + subdir : '');
}