#!/bin/sh
package_archive=spatial_intercom_server-$(cat package.json | jq -r .version).tgz
temp_rep_dir=/tmp/$(date "+%F-%T")$(git rev-parse HEAD)__deploy_dir
temp_pwd=$(pwd)

npm pack

mkdir -p $temp_rep_dir
git -C $temp_rep_dir clone https://github.com/jonasohland/si_deploy
tar -C $temp_rep_dir -xzvf $package_archive
mv -f $temp_rep_dir/package/*  $temp_rep_dir/si_deploy
git -C $temp_rep_dir/si_deploy add .
git -C $temp_rep_dir/si_deploy commit -am "Deploy-auto-commit from release "$(cat package.json | jq -r .version)" commit hash "$(git rev-parse HEAD)
git -C $temp_rep_dir/si_deploy push
rm -rf $temp_rep_dir


# mv $temp_rep_dir/si_deploy $temp_rep_dir
# cd __deploy_dir

# tar -xzvf ../$package_archive
# git -C $temp_rep_dir add
# git commit -am "Deploy auto-commit. Build from commit# "$(git rev-parse HEAD)
# git push

# cd ..

# cd $temp_pwd
