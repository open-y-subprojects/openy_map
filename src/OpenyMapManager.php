<?php

namespace Drupal\openy_map;

use Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException;
use Drupal\Component\Plugin\Exception\PluginNotFoundException;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Entity\EntityFieldManagerInterface;

/**
 * OpenY Map module service.
 */
class OpenyMapManager {

  /**
   * The entity type manager.
   *
   * @var \Drupal\Core\Entity\EntityTypeManagerInterface
   */
  protected $entityTypeManager;

  /**
   * The entity field manager.
   *
   * @var \Drupal\Core\Entity\EntityFieldManagerInterface
   */
  protected $entityFieldManager;

  /**
   * Class constructor.
   *
   * @param \Drupal\Core\Entity\EntityTypeManagerInterface $entity_type_manager
   *   The entity type manager.
   * @param \Drupal\Core\Entity\EntityFieldManagerInterface $entity_field_manager
   *   The entity field manager.
   */
  public function __construct(EntityTypeManagerInterface $entity_type_manager,
                              EntityFieldManagerInterface $entity_field_manager) {
    $this->entityTypeManager = $entity_type_manager;
    $this->entityFieldManager = $entity_field_manager;
  }

  /**
   * Get all the node types using field_location_coordinates
   *
   * @return array
   *  Contains all the node types using the field.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public static function getLocationNodeTypes() {
    $node_types = [];
    $types = \Drupal::entityTypeManager()
      ->getStorage('node_type')
      ->loadMultiple();

    $all_bundle_fields = \Drupal::service('entity_field.manager');
    if (!empty($types)) {
      foreach($types as $type) {
        $definitions = $all_bundle_fields->getFieldDefinitions('node', $type->id());
        if (isset($definitions['field_location_coordinates'])) {
          $node_types[$type->id()] = $type;
        }
      }
    }
    return $node_types;
  }

}
