#!/bin/bash

host="$1"
user="$SSH_USER"

if [ ! -f package.json ]; then
	cd ..
fi

if [ ! -f package.json ]; then
	echo "Are you sure that you are running this from inside jannah folder?";
	exit 1
fi

if [ -z "$host" ]; then
	echo "No target hostname specified"
	echo "Usage is $0 <target>"
	exit 1
fi

if [ -z "$user" ]; then
	user="$(whoami)"
fi

ssh -q "$user"@"$host" exit

if [ "$?" != "0" ]; then
	echo "Your username doesn't exist on machine, provide one using env variable SSH_USER"
	exit 1
fi

ssh "$user"@"$host" "sudo chown -R $user /opt/compatipede"

rsync --delete -zr --exclude node_modules --exclude .git --exclude .env --exclude .gitignore ./ "$user"@"$host":/opt/compatipede

echo "Rsync done"

output=$(ssh "$user"@"$host" "cd /opt/compatipede && sudo chown -R $user ./ && npm install && sudo chgrp -R nodejs ./" 2>&1)

if [ "$?" != "0" ]; then
	echo "--------------"
	echo "$output"
	echo "--------------"
	echo "Failed to install deps"
	exit 1
fi

echo "Deployed new compatipede version"
