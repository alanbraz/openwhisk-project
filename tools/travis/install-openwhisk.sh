#!/usr/bin/env bash
set -e

cd $TRAVIS_BUILD_DIR

git clone --depth 3 https://github.com/apache/incubator-openwhisk.git openwhisk
cd openwhisk
./tools/travis/setup.sh

ANSIBLE_CMD="ansible-playbook -i environments/local -e docker_image_prefix=openwhisk"

cd ansible
$ANSIBLE_CMD setup.yml
$ANSIBLE_CMD prereq.yml
$ANSIBLE_CMD couchdb.yml
$ANSIBLE_CMD initdb.yml

$ANSIBLE_CMD wipe.yml
$ANSIBLE_CMD openwhisk.yml -e '{"openwhisk_cli":{"installation_mode":"remote","remote":{"name":"OpenWhisk_CLI","dest_name":"OpenWhisk_CLI","location":"https://github.com/apache/incubator-openwhisk-cli/releases/download/latest"}}}'
$ANSIBLE_CMD postdeploy.yml

cd ..
cat whisk.properties

cp $TRAVIS_BUILD_DIR/tools/travis/wskprops ~/.wskprops
./bin/wsk property set --auth `cat ansible/files/auth.guest`
cat ~/.wskprops

export OPENWHISK_DIR=$TRAVIS_BUILD_DIR/openwhisk
$OPENWHISK_DIR/bin/wsk -i property get