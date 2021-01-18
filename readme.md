
roadmap:
- offline form subscription
- Limit extensions for file upload
- Allow external endpoint for integrations
- Improve config_rocketchat
- Bug: when message sent after api send (luan)
- OK - Send text and file from instance api
- OK - better media management - do not override - No need to static anymore
- OK - rocketchat business hour closed compliance
- OK - better QR code offering to rocketchat, not depending on external api
- OK - media messages both ways
- OK - resilience when number disconnects
- OK - alert when batterychange
- OK - external per instance send
- OK - numbers exists api
- OK - alerts to more than 1 users
- OK - Alert rocketchat manager on battery threshould
- OK - Files upload (pdf, push to talk, images, etc)
- OK - Allow per instance business hours

IF YOU WANT TO HELP DEVELOPING:
```
cp config/config.json.dist config/config.json
docker-compose -f dev.yml up -d
docker-compose -f dev.yml exec rocket_connect node config_rocketchat
```

the config_rocketchat will create users, agents, departments and setup the environment. It creates DepartmentA, DepartmentB, agent1, agent2 and the admin user: debug (password is equal to username). You should add the agents to the Department.

Login into Rocketchat: http://127.0.0.1:3000

You should receive the QR code. Scan it with the WhatsApp you want to link.
