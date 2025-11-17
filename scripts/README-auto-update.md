# Auto Update Script

Simple cron-based automatic system updates.

## Installation

1. Make the script executable:
```bash
chmod +x /home/qiss/stuco/scripts/auto-update.sh
```

2. Edit root's crontab:
```bash
sudo crontab -e
```

3. Add this line to run every Monday at 3 AM:
```
0 3 * * 1 /home/qiss/stuco/scripts/auto-update.sh
```

Or for other schedules:
```bash
# Every day at 3 AM
0 3 * * * /home/qiss/stuco/scripts/auto-update.sh

# Every Sunday at midnight
0 0 * * 0 /home/qiss/stuco/scripts/auto-update.sh

# Every Monday and Thursday at 3 AM
0 3 * * 1,4 /home/qiss/stuco/scripts/auto-update.sh

# First day of every month at 2 AM
0 2 1 * * /home/qiss/stuco/scripts/auto-update.sh
```

## Cron Schedule Format

```
* * * * * command
│ │ │ │ │
│ │ │ │ └─── Day of week (0-7, 0 or 7 is Sunday)
│ │ │ └───── Month (1-12)
│ │ └─────── Day of month (1-31)
│ └───────── Hour (0-23)
└─────────── Minute (0-59)
```

## Management

### View logs:
```bash
sudo tail -f /var/log/auto-update.log
```

### View recent updates:
```bash
sudo tail -n 50 /var/log/auto-update.log
```

### Check failure count:
```bash
cat /var/tmp/auto-update-failures 2>/dev/null || echo "No failures"
```

### Reset failures:
```bash
sudo rm /var/tmp/auto-update-failures
```

### Manually run update:
```bash
sudo /home/qiss/stuco/scripts/auto-update.sh
```

### List current cron jobs:
```bash
sudo crontab -l
```

### Remove cron job:
```bash
sudo crontab -e
# Then delete the line with auto-update.sh
```

## Features

- Updates package lists
- Upgrades all packages non-interactively
- Removes unnecessary packages
- Cleans package cache
- Logs all operations to `/var/log/auto-update.log`
- Tracks failures - stops after 3 failures
- Much simpler than systemd!

## What it does

1. Checks if there have been too many recent failures (stops at 3)
2. Runs `apt update`
3. Runs `apt upgrade -y`
4. Runs `apt autoremove -y`
5. Runs `apt autoclean`
6. Logs everything to `/var/log/auto-update.log`

If any critical step fails, it increments a failure counter. After 3 failures, it stops trying until you manually reset the counter.

