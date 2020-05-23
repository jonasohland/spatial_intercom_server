#!/bin/sh
package_archive=spatial_intercom_server-$(cat package.json | jq -r .version).tgz
temp_rep_dir=/tmp/$(date "+%F-%T")$(git rev-parse HEAD)__deploy_dir
temp_pwd=$(pwd)

npm pack

mkdir -p $temp_rep_dir
git -C $temp_rep_dir clone https://github.com/jonasohland/si_deploy
tar -C $temp_rep_dir -xzvf $package_archive

rm -rf $temp_rep_dir/si_deploy/bin
rm -rf $temp_rep_dir/si_deploy/dist
rm -rf $temp_rep_dir/si_deploy/platform
rm -rf $temp_rep_dir/si_deploy/src
rm -rf $temp_rep_dir/si_deploy/typings

mv -f $temp_rep_dir/package/*  $temp_rep_dir/si_deploy

git -C $temp_rep_dir/si_deploy add .
git -C $temp_rep_dir/si_deploy commit -am "Deploy commit @"$(cat package.json | jq -r .version)" from jonasohland/spatial_intercom_server@"$(git rev-parse --short HEAD)
git -C $temp_rep_dir/si_deploy push
rm -rf $temp_rep_dir
