<?php

use Drupal\Core\Extension\ModuleInstallerInterface;

/**
 * @file
 * Post update hooks for Open Y Map.
 */

/**
 * Enable the 'y_branch' module.
 */
function openy_map_post_update_1_enable_y_branch() {
  $moduleInstaller = \Drupal::service('module_installer');
  assert($moduleInstaller instanceof ModuleInstallerInterface);
  $moduleInstaller->install(['y_branch']);
}
