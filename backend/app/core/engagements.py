import os
from datetime import datetime


def create_engagement_folder(engagement_id: str, target_domain: str, base_path: str) -> str:
    date_str = datetime.utcnow().strftime("%Y%m%d")
    safe_target = target_domain.replace(".", "-").replace("/", "-").replace(":", "-")
    folder_name = f"{engagement_id[:8]}_{safe_target}_{date_str}"
    folder_path = os.path.join(base_path, folder_name)

    subdirs = [
        "pre_engagement",
        os.path.join("phase_1_recon", "evidence"),
        os.path.join("phase_2_weaponization", "evidence"),
        os.path.join("phase_3_delivery"),
        os.path.join("phase_4_exploitation", "evidence"),
        os.path.join("phase_5_installation", "evidence", "web_shells"),
        os.path.join("phase_5_installation", "evidence", "accounts"),
        os.path.join("phase_5_installation", "evidence", "xss"),
        os.path.join("phase_5_installation", "evidence", "file_access"),
        os.path.join("phase_5_installation", "evidence", "database"),
        os.path.join("phase_6_c2", "evidence", "callbacks"),
        os.path.join("phase_6_c2", "evidence", "egress"),
        os.path.join("phase_7_actions", "evidence", "data_samples"),
        os.path.join("phase_7_actions", "evidence", "lateral_movement"),
        os.path.join("phase_7_actions", "evidence", "screenshots"),
        "engagement_report",
    ]

    for subdir in subdirs:
        os.makedirs(os.path.join(folder_path, subdir), exist_ok=True)

    return folder_path
